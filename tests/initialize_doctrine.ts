import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Aion } from "../target/types/aion";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import { assert } from "chai";

describe("Doctrine Initialization", () => {
    // Configure the client to use the local cluster
    const provider = anchor.AnchorProvider.env();
    anchor.setProvider(provider);

    const program = anchor.workspace.Aion as Program<Aion>;
    
    // Constants
    const PROGRAM_ID = new PublicKey("Aiondoc3kxg6Yekk87CUnCVsNoj5wJJvCBdybWk75RHK");
    const INITIAL_MESSAGE_COST = new anchor.BN(100_000_000_000); // 100,000 tokens with 6 decimals

    before(async () => {
        console.log("Test setup starting...");
        console.log("Program ID:", PROGRAM_ID.toString());
        console.log("Wallet address:", provider.wallet.publicKey.toString());
    });

    it("Should initialize doctrines from 1 to 10", async () => {
        for (let doctrineId = 1; doctrineId <= 10; doctrineId++) {
            // Derive the doctrine PDA
            const [doctrinePda] = PublicKey.findProgramAddressSync(
                [Buffer.from("doctrine"), Buffer.from([doctrineId])],
                program.programId
            );
            
            try {
                // Derive the first page PDA
                const [firstPagePda] = PublicKey.findProgramAddressSync(
                    [
                        Buffer.from("page"),
                        Buffer.from("doctrine"),
                        Buffer.from([doctrineId]),
                        Buffer.from([0, 0, 0, 0])  // page number 0
                    ],
                    program.programId
                );
                console.log(`Doctrine ${doctrineId} First Page PDA:`, firstPagePda.toString());

                // Initialize the doctrine
                const tx = await program.methods
                    .initializeDoctrine(doctrineId)
                    .accounts({
                        authority: provider.wallet.publicKey,
                        doctrine: doctrinePda,
                        firstPage: firstPagePda,
                        systemProgram: SystemProgram.programId,
                    })
                    .rpc();

                console.log(`Doctrine ${doctrineId} initialized successfully!`);
                console.log("Transaction signature:", tx);

                // Fetch and verify doctrine account data
                const doctrineAccount = await program.account.doctrine.fetch(doctrinePda);
                console.log(`Doctrine ${doctrineId} account data:`, doctrineAccount);

                // Verify doctrine state
                assert.equal(doctrineAccount.doctrineId, doctrineId, "Doctrine ID should match");
                assert.equal(
                    doctrineAccount.authority.toString(),
                    provider.wallet.publicKey.toString(),
                    "Authority should match wallet"
                );
                assert.equal(doctrineAccount.totalMessages, 0, "Total messages should be 0");
                assert.equal(doctrineAccount.activePageNumber, 0, "Current page should be 0");
                assert.equal(doctrineAccount.messagesPerPage, 100, "Messages per page should be 100");
                assert.equal(doctrineAccount.currentPageMessageCount, 0, "Current page message count should be 0");
                assert.equal(doctrineAccount.activePageNumber, 0, "Active page number should be 0");
                assert.equal(
                    doctrineAccount.currentMessageCost.toString(),
                    INITIAL_MESSAGE_COST.toString(),
                    "Initial message cost should match"
                );

                // Fetch and verify first page account data
                const firstPageAccount = await program.account.doctrinePage.fetch(firstPagePda);
                assert.equal(
                    firstPageAccount.doctrine.toString(),
                    doctrinePda.toString(),
                    "First page doctrine reference should match"
                );
                assert.equal(firstPageAccount.pageNumber, 0, "First page number should be 0");
                assert.equal(firstPageAccount.messages.length, 0, "Messages array should be empty");

            } catch (e: any) {
                if (e.toString().includes("already in use")) {
                    console.log(`Doctrine ${doctrineId} already exists, verifying state...`);
                    
                    // Verify existing doctrine state
                    const doctrineAccount = await program.account.doctrine.fetch(doctrinePda);
                    assert.equal(doctrineAccount.doctrineId, doctrineId, "Existing doctrine ID should match");
                    assert.ok(doctrineAccount.authority, "Existing doctrine should have authority");
                    continue;
                }
                console.error(`Error initializing doctrine ${doctrineId}:`, e);
                throw e;
            }
        }
    });

    it("Should fail to initialize doctrines with ID > 10", async () => {
        try {
            const invalidDoctrineId = 11;
            const [doctrinePda] = PublicKey.findProgramAddressSync(
                [Buffer.from("doctrine"), Buffer.from([invalidDoctrineId])],
                PROGRAM_ID
            );

            const [firstPagePda] = PublicKey.findProgramAddressSync(
                [
                    Buffer.from("page"),
                    Buffer.from("doctrine"),
                    Buffer.from([invalidDoctrineId]),
                    Buffer.from([0, 0, 0, 0])
                ],
                PROGRAM_ID
            );

            await program.methods
                .initializeDoctrine(invalidDoctrineId)
                .accounts({
                    authority: provider.wallet.publicKey,
                    doctrine: doctrinePda,
                    firstPage: firstPagePda,
                    systemProgram: SystemProgram.programId,
                })
                .rpc();

            assert.fail("Should have failed to initialize doctrine with ID > 10");
        } catch (e: any) {
            if (e.toString().includes("InvalidDoctrineId")) {
                console.log("Successfully caught invalid doctrine ID error:", e.toString());
            } else {
                throw e;
            }
        }
    });

    it("Should fail to initialize doctrine with same ID again", async () => {
        try {
            const doctrineId = 1;
            const [doctrinePda] = PublicKey.findProgramAddressSync(
                [Buffer.from("doctrine"), Buffer.from([doctrineId])],
                PROGRAM_ID
            );

            const [firstPagePda] = PublicKey.findProgramAddressSync(
                [
                    Buffer.from("page"),
                    Buffer.from("doctrine"),
                    Buffer.from([doctrineId]),
                    Buffer.from([0, 0, 0, 0])
                ],
                PROGRAM_ID
            );

            await program.methods
                .initializeDoctrine(doctrineId)
                .accounts({
                    authority: provider.wallet.publicKey,
                    doctrine: doctrinePda,
                    firstPage: firstPagePda,
                    systemProgram: SystemProgram.programId,
                })
                .rpc();

            assert.fail("Should have failed to initialize doctrine with same ID");
        } catch (e: any) {
            if (e.toString().includes("already in use")) {
                console.log("Successfully caught duplicate initialization error:", e.toString());
            } else {
                throw e;
            }
        }
    });
});