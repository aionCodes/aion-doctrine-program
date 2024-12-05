import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, getAccount, getAssociatedTokenAddress } from "@solana/spl-token";
import { assert } from "chai";
import { Aion } from "../target/types/aion";

describe("Test Add Message to Active Page", () => {
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
    });

    it("Should add message to active page in doctrine1", async () => {
        // First, fetch the doctrine to get the active page number
        const doctrine = await program.account.doctrine.fetch(doctrinePDA);
        const activePageNumber = doctrine.activePageNumber;
        console.log("Active page number:", activePageNumber);

        // Get the active page PDA
        const [activePagePDA] = PublicKey.findProgramAddressSync(
            [
                Buffer.from("page"),
                Buffer.from("doctrine"),
                Buffer.from([DOCTRINE_ID]),
                new anchor.BN(activePageNumber).toArrayLike(Buffer, 'le', 4)
            ],
            PROGRAM_ID
        );
        console.log("Active Page PDA:", activePagePDA.toBase58());

        // Create a test message
        const ipfsCid = Buffer.alloc(46);
        ipfsCid.fill(1);  // Fill with some test data

        // Get token balance before
        const tokenAccountBefore = await getAccount(provider.connection, userTokenAccount);
        
        // Add message to the active page
        const tx = await program.methods
            .addMessageToCurrentPage(ipfsCid)
            .accounts({
                authority: provider.wallet.publicKey,
                config: configPDA,
                doctrine: doctrinePDA,
                mint: AION_MINT,
                page: activePagePDA,
                tokenAccount: userTokenAccount,
                tokenProgram: TOKEN_PROGRAM_ID,
                systemProgram: SystemProgram.programId,
            })
            .rpc();

        console.log("Transaction signature:", tx);

        // Verify the message was added
        const doctrineAfter = await program.account.doctrine.fetch(doctrinePDA);
        assert(doctrineAfter.currentPageMessageCount > doctrine.currentPageMessageCount, 
            "Message count should have increased");

        // Verify tokens were burned
        const tokenAccountAfter = await getAccount(provider.connection, userTokenAccount);
        const burnedAmount = new anchor.BN(tokenAccountBefore.amount.toString())
            .sub(new anchor.BN(tokenAccountAfter.amount.toString()));
        assert(burnedAmount.gt(new anchor.BN(0)), "Tokens should be burned");
    });
});
