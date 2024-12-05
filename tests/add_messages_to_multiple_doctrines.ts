import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, getAccount, getAssociatedTokenAddress } from "@solana/spl-token";
import { assert } from "chai";
import { Aion } from "../target/types/aion";

describe("Add Messages to Multiple Doctrines Tests", () => {
    const provider = anchor.AnchorProvider.env();
    anchor.setProvider(provider);

    const program = anchor.workspace.Aion as Program<Aion>;
    const PROGRAM_ID = new PublicKey("Aiondoc3kxg6Yekk87CUnCVsNoj5wJJvCBdybWk75RHK");
    const AION_MINT = new PublicKey("");
    const DOCTRINE_IDS = [2, 3, 4]; // Testing doctrines 2, 3, and 4
    const INITIAL_MESSAGE_COST = new anchor.BN(100_000_000_000); // 100,000 tokens with 6 decimals
    const messages = [
    ];

    let doctrinePDAs: PublicKey[] = [];
    let configPDA: PublicKey;
    let userTokenAccount: PublicKey;

    before(async () => {
        console.log("Setting up test environment...");

        // Get the doctrine PDAs
        DOCTRINE_IDS.forEach((id) => {
            const [doctrinePDA] = PublicKey.findProgramAddressSync(
                [Buffer.from("doctrine"), Buffer.from([id])],
                PROGRAM_ID
            );
            doctrinePDAs.push(doctrinePDA);
            console.log(`Doctrine ${id} PDA:`, doctrinePDA.toBase58());
        });

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

    it("Should add messages to multiple doctrines simultaneously", async () => {
        // Get token balance before
        const tokenAccountBefore = await getAccount(provider.connection, userTokenAccount);
        
        // Add messages to each doctrine
        for (let i = 0; i < DOCTRINE_IDS.length; i++) {
            const doctrineId = DOCTRINE_IDS[i];
            const doctrinePDA = doctrinePDAs[i];
            const message = messages[i];

            console.log(`Adding message to Doctrine ${doctrineId}...`);
            
            try {
                // Get doctrine state before
                const doctrineBefore = await program.account.doctrine.fetch(doctrinePDA);

                // Find current page PDA
                const [pagePDA] = PublicKey.findProgramAddressSync(
                    [
                        Buffer.from("page"),
                        Buffer.from("doctrine"),
                        Buffer.from([doctrineId]),  
                        new anchor.BN(doctrineBefore.activePageNumber).toArrayLike(Buffer, 'le', 4)
                    ],
                    PROGRAM_ID
                );

                // Create message with exact IPFS CID length
                const ipfsCid = Buffer.alloc(46);
                Buffer.from(message).copy(ipfsCid);

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

                console.log(`Transaction signature for Doctrine ${doctrineId}:`, tx);

                // Verify the message was added
                const pageAccount = await program.account.doctrinePage.fetch(pagePDA);
                assert.equal(pageAccount.messages.length, doctrineBefore.currentPageMessageCount + 1, "Message should be added");
                assert.deepEqual(
                    Buffer.from(pageAccount.messages[pageAccount.messages.length - 1].ipfsCid),
                    ipfsCid,
                    "Message content should match"
                );
                
                // Verify token burn
                const expectedBurn = INITIAL_MESSAGE_COST.add(
                    INITIAL_MESSAGE_COST.mul(new anchor.BN(doctrineBefore.currentMessageCostIncrease)).div(new anchor.BN(100))
                );
                console.log(`Expected token burn for Doctrine ${doctrineId}:`, expectedBurn.toString());
            } catch (error) {
                console.error(`Error adding message to Doctrine ${doctrineId}:`, error);
                throw error;
            }
        }

        // Get token balance after
        const tokenAccountAfter = await getAccount(provider.connection, userTokenAccount);
        console.log("Token balance change:", 
            tokenAccountBefore.amount.toString(), "->", 
            tokenAccountAfter.amount.toString());
    });

    it("Should verify all messages were added correctly", async () => {
        for (let i = 0; i < DOCTRINE_IDS.length; i++) {
            const doctrineId = DOCTRINE_IDS[i];
            const doctrinePDA = doctrinePDAs[i];
            const message = messages[i];

            console.log(`Verifying Doctrine ${doctrineId}...`);
            
            const doctrine = await program.account.doctrine.fetch(doctrinePDA);
            const [pagePDA] = PublicKey.findProgramAddressSync(
                [
                    Buffer.from("page"),
                    Buffer.from("doctrine"),
                    Buffer.from([doctrineId]),
                    new anchor.BN(doctrine.activePageNumber).toArrayLike(Buffer, 'le', 4)
                ],
                PROGRAM_ID
            );

            const pageAccount = await program.account.doctrinePage.fetch(pagePDA);
            console.log(`Doctrine ${doctrineId} messages:`, pageAccount.messages);
            
            // Create expected IPFS CID buffer
            const expectedIpfsCid = Buffer.alloc(46);
            Buffer.from(message).copy(expectedIpfsCid);

            assert(pageAccount.messages.length > 0, `Doctrine ${doctrineId} should have at least one message`);
            assert.deepEqual(
                Buffer.from(pageAccount.messages[pageAccount.messages.length - 1].ipfsCid),
                expectedIpfsCid,
                `Message content should match for Doctrine ${doctrineId}`
            );
        }
    });
});
