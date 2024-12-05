import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, getAccount, getAssociatedTokenAddress } from "@solana/spl-token";
import { assert } from "chai";
import { Aion } from "../target/types/aion";

describe("Test Page Transition Instructions", () => {
    const provider = anchor.AnchorProvider.env();
    anchor.setProvider(provider);

    const program = anchor.workspace.Aion as Program<Aion>;
    const PROGRAM_ID = new PublicKey("Aiondoc3kxg6Yekk87CUnCVsNoj5wJJvCBdybWk75RHK");
    const AION_MINT = new PublicKey("");
    const DOCTRINE_ID = 1;

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

        // Get and log initial doctrine state
        const doctrine = await program.account.doctrine.fetch(doctrinePDA);
        console.log("Initial doctrine state:", {
            totalMessages: doctrine.totalMessages.toString(),
            activePageNumber: doctrine.activePageNumber,
            currentPageMessageCount: doctrine.currentPageMessageCount,
            messagesPerPage: doctrine.messagesPerPage,
        });

        // Verify preconditions
        assert.equal(doctrine.currentPageMessageCount, 100, 
            "Current page should be full before starting test");
    });

    it("Should fail to add message to current page when full and succeed with new page", async () => {
        // Get token balance before
        const tokenAccountBefore = await getAccount(provider.connection, userTokenAccount);
        
        // Create message with exact IPFS CID length
        const ipfsCid = Buffer.alloc(46);
        Buffer.from("").copy(ipfsCid);

        // Get current doctrine state
        const doctrineBefore = await program.account.doctrine.fetch(doctrinePDA);
        console.log("Initial doctrine state:", {
            totalMessages: doctrineBefore.totalMessages.toString(),
            activePageNumber: doctrineBefore.activePageNumber,
            currentPageMessageCount: doctrineBefore.currentPageMessageCount,
        });

        // Get current page PDA
        const [currentPagePDA] = PublicKey.findProgramAddressSync(
            [
                Buffer.from("page"),
                Buffer.from("doctrine"),
                Buffer.from([DOCTRINE_ID]),
                new anchor.BN(doctrineBefore.activePageNumber).toArrayLike(Buffer, 'le', 4)
            ],
            PROGRAM_ID
        );

        // Get current page and verify it's full
        const currentPage = await program.account.doctrinePage.fetch(currentPagePDA);
        assert.equal(currentPage.messages.length, 100, "Current page should be full before transition");

        // Get new page PDA
        const [newPagePDA] = PublicKey.findProgramAddressSync(
            [
                Buffer.from("page"),
                Buffer.from("doctrine"),
                Buffer.from([DOCTRINE_ID]),
                new anchor.BN(doctrineBefore.activePageNumber + 1).toArrayLike(Buffer, 'le', 4)
            ],
            PROGRAM_ID
        );

        // First try to add message to current page (should fail)
        console.log("\nTrying to add message to current full page...");
        try {
            await program.methods
                .addMessageToCurrentPage(ipfsCid)
                .accounts({
                    authority: provider.wallet.publicKey,
                    config: configPDA,
                    doctrine: doctrinePDA,
                    mint: AION_MINT,
                    page: currentPagePDA,
                    tokenAccount: userTokenAccount,
                    tokenProgram: TOKEN_PROGRAM_ID,
                    systemProgram: SystemProgram.programId,
                })
                .rpc();
            assert.fail("Should have thrown error when adding to full page");
        } catch (error) {
            console.log("Error details:", error);
            assert(error.toString().includes("PageIsFull") || 
                   error.toString().includes("Error Code: 6"), 
                   "Expected PageIsFull error");
        }

        // Now try to add message to new page (should succeed)
        console.log("\nTrying to add message to new page...");
        const tx = await program.methods
            .addMessageToNewPage(ipfsCid)
            .accounts({
                authority: provider.wallet.publicKey,
                config: configPDA,
                doctrine: doctrinePDA,
                currentPage: currentPagePDA,
                newPage: newPagePDA,
                mint: AION_MINT,
                tokenAccount: userTokenAccount,
                tokenProgram: TOKEN_PROGRAM_ID,
                systemProgram: SystemProgram.programId,
            })
            .rpc();

        console.log("Transaction signature:", tx);

        // Verify final state
        const doctrineFinal = await program.account.doctrine.fetch(doctrinePDA);
        console.log("\nFinal doctrine state:", {
            totalMessages: doctrineFinal.totalMessages.toString(),
            activePageNumber: doctrineFinal.activePageNumber,
            currentPageMessageCount: doctrineFinal.currentPageMessageCount,
        });

        // Verify we're on the new page
        assert.equal(doctrineFinal.activePageNumber, doctrineBefore.activePageNumber + 1, "Should be on next page");
        assert.equal(
            doctrineFinal.totalMessages.toString(),
            (parseInt(doctrineBefore.totalMessages.toString()) + 1).toString(),
            "Should have one more message"
        );
        assert.equal(doctrineFinal.currentPageMessageCount, 1, "New page should have 1 message");

        // Verify new page state
        const newPage = await program.account.doctrinePage.fetch(newPagePDA);
        assert.equal(newPage.pageNumber, doctrineBefore.activePageNumber + 1, "New page should have correct page number");
        assert.equal(newPage.messages.length, 1, "New page should have 1 message");

        // Verify token burn
        const tokenAccountAfter = await getAccount(provider.connection, userTokenAccount);
        const burnedAmount = new anchor.BN(tokenAccountBefore.amount.toString())
            .sub(new anchor.BN(tokenAccountAfter.amount.toString()));
        assert(burnedAmount.gt(new anchor.BN(0)), "Tokens should be burned");

        // Verify cost increase
        const expectedNewCost = doctrineBefore.currentMessageCost
            .mul(new anchor.BN(101))
            .div(new anchor.BN(100));
        assert.equal(
            doctrineFinal.currentMessageCost.toString(),
            expectedNewCost.toString(),
            "Message cost should increase by 1%"
        );
    });
});