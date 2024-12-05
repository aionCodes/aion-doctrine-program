import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Aion } from "../target/types/aion";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import { assert } from "chai";

describe("System Initialization", () => {
    // Configure the client to use the local cluster
    const provider = anchor.AnchorProvider.env();
    anchor.setProvider(provider);
    const program = anchor.workspace.Aion as Program<Aion>;

    // Constants
    const PROGRAM_ID = new PublicKey("Aiondoc3kxg6Yekk87CUnCVsNoj5wJJvCBdybWk75RHK ");
    const AION_MINT = new PublicKey("");

    before(async () => {
        console.log("Test setup starting...");
        console.log("Program ID:", PROGRAM_ID.toString());
        console.log("Wallet address:", provider.wallet.publicKey.toString());
        console.log("AION Mint address:", AION_MINT.toString());
    });

    after(async () => {
        console.log("Test cleanup completed");
    });

    it("Should initialize the system", async () => {
        // Find PDA for config
        const [configPda] = PublicKey.findProgramAddressSync(
            [Buffer.from("config")],
            PROGRAM_ID
        );
        console.log("Config PDA:", configPda.toString());

        try {
            // Initialize the system
            const tx = await program.methods
                .initializeSystem()
                .accounts({
                    config: configPda,
                    authority: provider.wallet.publicKey,
                    mint: AION_MINT,
                    systemProgram: SystemProgram.programId,
                })
                .rpc();
            console.log("Transaction signature:", tx);

            // Verify the configuration
            const configAccount = await program.account.systemConfig.fetch(configPda);
            console.log("Config account data:", configAccount);

            // Add assertions to verify the initialization
            assert.ok(configAccount.authority, "Authority should be set");
            assert.equal(
                configAccount.authority.toString(),
                provider.wallet.publicKey.toString(),
                "Authority should match the wallet public key"
            );
            assert.equal(
                configAccount.tokenMint.toString(),
                AION_MINT.toString(),
                "Token mint should match the AION mint address"
            );
            assert.ok(configAccount.bump, "Bump seed should be set");

        } catch (e: any) {
            if (e.toString().includes("already in use")) {
                console.log("System config already exists");
                // Fetch and verify existing config
                const configAccount = await program.account.systemConfig.fetch(configPda);
                console.log("Existing config account data:", configAccount);
                
                // Verify existing configuration
                assert.ok(configAccount.authority, "Authority should be set in existing config");
                assert.equal(
                    configAccount.tokenMint.toString(),
                    AION_MINT.toString(),
                    "Existing token mint should match the AION mint address"
                );
            } else {
                console.error("Initialization failed with error:", e);
                throw e;
            }
        }
    });
});