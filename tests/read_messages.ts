import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { assert } from "chai";
import { Aion } from "../target/types/aion";

describe("Read Messages Tests", () => {
    const provider = anchor.AnchorProvider.env();
    anchor.setProvider(provider);

    const program = anchor.workspace.Aion as Program<Aion>;
    const PROGRAM_ID = new PublicKey("Aiondoc3kxg6Yekk87CUnCVsNoj5wJJvCBdybWk75RHK");
    const AION_MINT = new PublicKey("");

    before(async () => {
        console.log("Test setup starting...");
        console.log("Program ID:", PROGRAM_ID.toString());
        console.log("Wallet address:", provider.wallet.publicKey.toString());
    });

    it("Should read all doctrines and their messages", async () => {
        // Loop through all doctrines (1-10)
        for (let doctrineId = 1; doctrineId <= 10; doctrineId++) {
            console.log(`\n=== Checking Doctrine ${doctrineId} ===`);
            
            // Get doctrine PDA
            const [doctrinePDA] = PublicKey.findProgramAddressSync(
                [Buffer.from("doctrine"), Buffer.from([doctrineId])],
                PROGRAM_ID
            );
            console.log("Doctrine PDA:", doctrinePDA.toString());

            try {
                // Get doctrine info
                const doctrineAccount = await program.account.doctrine.fetch(doctrinePDA);
                console.log("Doctrine info:", {
                    authority: doctrineAccount.authority.toString(),
                    doctrineId: doctrineAccount.doctrineId,
                    totalMessages: doctrineAccount.totalMessages.toString(),
                    activePageNumber: doctrineAccount.activePageNumber,
                    messagesPerPage: doctrineAccount.messagesPerPage,
                    currentPageMessageCount: doctrineAccount.currentPageMessageCount,
                    currentMessageCost: doctrineAccount.currentMessageCost.toString()
                });

                // Check all pages for this doctrine
                const maxPageNumber = doctrineAccount.activePageNumber;
                for (let pageNum = 0; pageNum <= maxPageNumber; pageNum++) {
                    console.log(`\n--- Page ${pageNum} ---`);
                    
                    // Get page PDA
                    const [pagePDA] = PublicKey.findProgramAddressSync(
                        [
                            Buffer.from("page"),
                            Buffer.from("doctrine"),
                            Buffer.from([doctrineId]),
                            new anchor.BN(pageNum).toArrayLike(Buffer, 'le', 4)
                        ],
                        PROGRAM_ID
                    );
                    console.log("Page PDA:", pagePDA.toString());

                    try {
                        // Fetch page data
                        const pageAccount = await program.account.doctrinePage.fetch(pagePDA);
                        console.log("Page info:", {
                            pageNumber: pageAccount.pageNumber,
                            messageCount: pageAccount.messages.length,
                            isActive: pageNum === doctrineAccount.activePageNumber
                        });

                        // Verify page data
                        assert.equal(
                            pageAccount.doctrine.toString(),
                            doctrinePDA.toString(),
                            "Page should reference correct doctrine"
                        );
                        assert.equal(
                            pageAccount.pageNumber,
                            pageNum,
                            `Should be page ${pageNum}`
                        );

                        // Log messages if any exist
                        if (pageAccount.messages.length > 0) {
                            console.log(`Found ${pageAccount.messages.length} messages:`);
                            pageAccount.messages.forEach((msg, index) => {
                                const cidString = Buffer.from(msg.ipfsCid).toString('utf8').replace(/\0+$/, '');
                                console.log(`Message ${index}:`, cidString);
                            });
                        } else {
                            console.log("No messages on this page");
                        }
                    } catch (e) {
                        if (e.toString().includes("Account does not exist")) {
                            console.log(`Page ${pageNum} does not exist`);
                        } else {
                            throw e;
                        }
                    }
                }
            } catch (e) {
                if (e.toString().includes("Account does not exist")) {
                    console.log(`Doctrine ${doctrineId} does not exist`);
                } else {
                    throw e;
                }
            }
        }
    });

    it("Should handle reading from non-existent page", async () => {
        const doctrineId = 1;
        // Try to read from a page that doesn't exist (page 999)
        const [invalidPagePDA] = PublicKey.findProgramAddressSync(
            [
                Buffer.from("page"),
                Buffer.from("doctrine"),
                Buffer.from([doctrineId]),
                new anchor.BN(999).toArrayLike(Buffer, 'le', 4)
            ],
            PROGRAM_ID
        );

        try {
            await program.account.doctrinePage.fetch(invalidPagePDA);
            assert.fail("Should not be able to read non-existent page");
        } catch (e) {
            assert.include(e.toString(), "Account does not exist", "Should fail with account not found error");
        }
    });
});
