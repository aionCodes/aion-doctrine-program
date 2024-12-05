import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Aion } from "../target/types/aion";
import {
  PublicKey,
  SystemProgram,
} from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, getAssociatedTokenAddress } from "@solana/spl-token";
import { assert } from "chai";

describe("Test Doctrine Page Transition", () => {
  // Configure mocha test timeout
  const TEST_TIMEOUT = 1000 * 60 * 30; // 30 minutes
  const MESSAGE_INTERVAL = 1000; // 1 seconds

  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.Aion as Program<Aion>;
  const PROGRAM_ID = new PublicKey("Aiondoc3kxg6Yekk87CUnCVsNoj5wJJvCBdybWk75RHK");
  const AION_MINT = new PublicKey("");
  
  // Store important accounts
  let userTokenAccount: PublicKey;
  
  // Test message
  const message = "";
  
  it("Should fill doctrine 1 with 100 messages and verify page transition", async () => {
    console.log("Test setup starting...");
    console.log("Program ID:", program.programId.toString());
    console.log("Wallet address:", provider.wallet.publicKey.toString());

    // Get the user's token account
    userTokenAccount = await getAssociatedTokenAddress(
      AION_MINT,
      provider.wallet.publicKey
    );
    console.log("User Token Account:", userTokenAccount.toString());

    // Get config PDA
    const [configPda] = await PublicKey.findProgramAddress(
      [
        Buffer.from("config"),
      ],
      program.programId
    );

    // Get doctrine PDA
    const [doctrinePda] = PublicKey.findProgramAddressSync(
      [Buffer.from("doctrine"), Buffer.from([1])], // doctrine_id = 1
      program.programId
    );

    // Get initial page PDA
    const [pagePda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("page"),
        Buffer.from("doctrine"),
        Buffer.from([1]), // doctrine_id = 1
        Buffer.from([0, 0, 0, 0]) // page number 0
      ],
      program.programId
    );

    console.log("\nStarting to add messages...");
    
    // Add 99 more messages (since there's already 1) to reach 100 total
    for (let i = 0; i < 99; i++) {
      try {
        // Get current doctrine account to check message count
        const doctrineAccount = await program.account.doctrine.fetch(doctrinePda);
        console.log(`Adding message ${i + 2}, Current page: ${doctrineAccount.activePageNumber}`);
        
        // Get current page PDA based on doctrine's current page
        const [currentPagePda] = PublicKey.findProgramAddressSync(
          [
            Buffer.from("page"),
            Buffer.from("doctrine"),
            Buffer.from([1]), // doctrine_id = 1
            new anchor.BN(doctrineAccount.activePageNumber).toArrayLike(Buffer, 'le', 4)
          ],
          program.programId
        );

        // Create message with exact IPFS CID length
        const ipfsCid = Buffer.alloc(46);
        Buffer.from(message).copy(ipfsCid);

        try {
          // Add message
          await program.methods
            .addMessageToCurrentPage(ipfsCid)
            .accounts({
              authority: provider.wallet.publicKey,
              config: configPda,
              doctrine: doctrinePda,
              mint: AION_MINT,
              page: currentPagePda,
              tokenAccount: userTokenAccount,
              tokenProgram: TOKEN_PROGRAM_ID,
            })
            .rpc();
          
          console.log(`Message ${i + 2} added successfully. Waiting 1 second...`);
          await new Promise(resolve => setTimeout(resolve, MESSAGE_INTERVAL));

          // If this is the last message (100th), verify the page transition
          if (i === 98) {
            console.log("\nVerifying page transition after 100 messages...");
            const doctrineAfter100 = await program.account.doctrine.fetch(doctrinePda);
            assert.equal(doctrineAfter100.activePageNumber, 1, "Current page should be 1 after 100 messages");
            
            // Verify next page exists
            const [nextPagePda] = PublicKey.findProgramAddressSync(
              [
                Buffer.from("page"),
                Buffer.from("doctrine"),
                Buffer.from([1]), // doctrine_id = 1
                new anchor.BN(1).toArrayLike(Buffer, 'le', 4)
              ],
              program.programId
            );
            
            const nextPageAccount = await program.account.page.fetch(nextPagePda);
            assert.equal(nextPageAccount.pageNumber, 1, "Next page should be created with number 1");
            console.log("Successfully verified page transition!");
          }
        } catch (error) {
          console.error(`Error adding message ${i + 2}:`, error);
          throw error;
        }
      } catch (error) {
        console.error(`Error adding message ${i + 2}:`, error);
        throw error;
      }
    }

    // Final verification
    const finalDoctrine = await program.account.doctrine.fetch(doctrinePda);
    console.log("\nFinal doctrine state:");
    console.log("Total messages:", finalDoctrine.totalMessages.toString());
    console.log("Current page:", finalDoctrine.activePageNumber);
    console.log("Current page message count:", finalDoctrine.currentPageMessageCount);
    
    // Verify total message count
    assert.equal(finalDoctrine.totalMessages.toString(), "100", "Should have 100 total messages");
    
    // Verify we're on page 1
    assert.equal(finalDoctrine.activePageNumber, 1, "Should be on page 1");
    
    // Verify first message on new page
    const [newPagePda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("page"),
        Buffer.from("doctrine"),
        Buffer.from([1]), // doctrine_id = 1
        Buffer.from([0, 0, 0, 1]) // page number 1
      ],
      program.programId
    );
    
    const newPage = await program.account.page.fetch(newPagePda);
    assert.equal(newPage.messageCount, 1, "New page should have 1 message");
  }, TEST_TIMEOUT);
});
