import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, getAccount, getAssociatedTokenAddress } from "@solana/spl-token";
import { assert } from "chai";
import { Aion } from "../target/types/aion";

describe("Add Messages to Current Page Tests", () => {
    const provider = anchor.AnchorProvider.env();
    anchor.setProvider(provider);

    const program = anchor.workspace.Aion as Program<Aion>;
    const PROGRAM_ID = new PublicKey("Aiondoc3kxg6Yekk87CUnCVsNoj5wJJvCBdybWk75RHK");
    const AION_MINT = new PublicKey("");
    const DOCTRINE_ID = 1;
    const INITIAL_MESSAGE_COST = new anchor.BN(100_000_000_000); // 100,000 tokens with 6 decimals

    let doctrinePDA: PublicKey;
    let configPDA: PublicKey;
    let userTokenAccount: PublicKey;

    before(async () => {
        console.log("Setting up test environment...");

        // Get the doctrine PDA
        [doctrinePDA] = PublicKey.findProgramAddressSync(
            [Buffer.from("doctrine"), Buffer.from([DOCTRINE_ID])],
            PROGRAM_ID
        );
        console.log("Doctrine PDA:", doctrinePDA.toBase58());

        // Get the config PDA
        [configPDA] = PublicKey.findProgramAddressSync(
            [Buffer.from("config")],
            PROGRAM_ID
        );

        // Get the user's token account
        userTokenAccount = await getAssociatedTokenAddress(
            AION_MINT,
            provider.wallet.publicKey
        );

        console.log("User Token Account:", userTokenAccount.toBase58());
    });

    it("Should add a message to current page and burn tokens", async () => {
        // Get token balance before
        const tokenAccountBefore = await getAccount(provider.connection, userTokenAccount);
        
        // Create message with exact IPFS CID length
        const ipfsCid = Buffer.alloc(46);
        Buffer.from("QmZet68CA2TRaSKrbS1Fy7fbtb7yrySbfSSJA9zwY7wacW").copy(ipfsCid);

        // Get doctrine state before
        const doctrineBefore = await program.account.doctrine.fetch(doctrinePDA);

        // Find current page PDA
        const [pagePDA] = PublicKey.findProgramAddressSync(
            [
                Buffer.from("page"),
                Buffer.from("doctrine"),
                Buffer.from([DOCTRINE_ID]),
                new anchor.BN(doctrineBefore.activePageNumber).toArrayLike(Buffer, 'le', 4)
            ],
            PROGRAM_ID
        );

        // Add message to current page
        const tx = await program.methods
            .addMessageToCurrentPage(ipfsCid)
            .accounts({
                authority: provider.wallet.publicKey,
                config: configPDA,
                doctrine: doctrinePDA,
                mint: AION_MINT,
                page: pagePDA,
                tokenAccount: userTokenAccount,
                tokenProgram: TOKEN_PROGRAM_ID,
            })
            .rpc();

        console.log("Transaction signature:", tx);

        // Verify message was added
        const pageAccount = await program.account.doctrinePage.fetch(pagePDA);
        assert.equal(pageAccount.messages.length, doctrineBefore.currentPageMessageCount + 1, "Message should be added");
        assert.deepEqual(
            Buffer.from(pageAccount.messages[pageAccount.messages.length - 1].ipfsCid),
            ipfsCid,
            "Message content should match"
        );

        // Verify doctrine state
        const doctrineAfter = await program.account.doctrine.fetch(doctrinePDA);
        assert.equal(doctrineAfter.totalMessages, doctrineBefore.totalMessages + 1, "Total messages should increase");
        assert.equal(doctrineAfter.currentPageMessageCount, doctrineBefore.currentPageMessageCount + 1, "Current page message count should increase");

        // Verify token burn
        const tokenAccountAfter = await getAccount(provider.connection, userTokenAccount);
        const burnedAmount = new anchor.BN(tokenAccountBefore.amount.toString())
            .sub(new anchor.BN(tokenAccountAfter.amount.toString()));
        
        const expectedCost = doctrineBefore.totalMessages === 0 
            ? INITIAL_MESSAGE_COST 
            : doctrineBefore.currentMessageCost;
        
        assert.equal(burnedAmount.toString(), expectedCost.toString(), "Correct amount of tokens should be burned");

        // Verify cost increase
        const expectedNewCost = expectedCost
            .mul(new anchor.BN(101))
            .div(new anchor.BN(100));
        assert.equal(
            doctrineAfter.currentMessageCost.toString(),
            expectedNewCost.toString(),
            "Message cost should increase by 1%"
        );
    });

    it("Should fail to add message when page is full", async () => {
        // Get current doctrine state
        const doctrine = await program.account.doctrine.fetch(doctrinePDA);
        
        // Only run this test if the page is full
        if (doctrine.currentPageMessageCount === 200) {
            // Try to add message to full page
            const ipfsCid = Buffer.alloc(46);
            Buffer.from("QmFailTestMessage0000000000000000000000").copy(ipfsCid);
            
            const [pagePDA] = PublicKey.findProgramAddressSync(
                [
                    Buffer.from("page"),
                    Buffer.from("doctrine"),
                    Buffer.from([DOCTRINE_ID]),
                    new anchor.BN(doctrine.activePageNumber).toArrayLike(Buffer, 'le', 4)
                ],
                PROGRAM_ID
            );
            
            try {
                await program.methods
                    .addMessageToCurrentPage(ipfsCid)
                    .accounts({
                        authority: provider.wallet.publicKey,
                        config: configPDA,
                        doctrine: doctrinePDA,
                        mint: AION_MINT,
                        page: pagePDA,
                        tokenAccount: userTokenAccount,
                        tokenProgram: TOKEN_PROGRAM_ID,
                    })
                    .rpc();
                assert.fail("Should have failed to add message to full page");
            } catch (e: any) {
                assert.include(e.toString(), "PageIsFull", "Should fail with PageIsFull error");
            }
        } else {
            console.log("Skipping full page test as current page is not full");
        }
    });
});
