import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, getAccount, getAssociatedTokenAddress } from "@solana/spl-token";
import { assert } from "chai";
import { Aion } from "../target/types/aion";
import * as fs from 'fs';
import * as path from 'path';

interface MessageData {
    doctrine_id: number;
    message_index: number;
    ipfs_cid: string;
}

describe("Add Messages from JSON Tests", () => {
    const provider = anchor.AnchorProvider.env();
    anchor.setProvider(provider);

    const program = anchor.workspace.Aion as Program<Aion>;
    const PROGRAM_ID = new PublicKey("Aiondoc3kxg6Yekk87CUnCVsNoj5wJJvCBdybWk75RHK");
    const AION_MINT = new PublicKey("");
    
    let configPDA: PublicKey;
    let userTokenAccount: PublicKey;
    let messages: MessageData[];

    before(async () => {
        console.log("Setting up test environment...");

        // Read messages from JSON file
        const jsonPath = path.join(__dirname, '..', 'message-cids.json');
        messages = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));

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

    it("Should add all messages from JSON to their respective doctrines", async () => {
        // Group messages by doctrine_id
        const messagesByDoctrine = messages.reduce((acc, msg) => {
            if (!acc[msg.doctrine_id]) {
                acc[msg.doctrine_id] = [];
            }
            acc[msg.doctrine_id].push(msg);
            return acc;
        }, {} as Record<number, MessageData[]>);

        // Process each doctrine
        for (const [doctrineId, doctrineMessages] of Object.entries(messagesByDoctrine)) {
            const id = parseInt(doctrineId);
            console.log(`Processing Doctrine ${id} with ${doctrineMessages.length} messages...`);

            const [doctrinePDA] = PublicKey.findProgramAddressSync(
                [Buffer.from("doctrine"), Buffer.from([id])],
                PROGRAM_ID
            );

            // Get doctrine state
            const doctrine = await program.account.doctrine.fetch(doctrinePDA);

            // Process each message
            for (const messageData of doctrineMessages) {
                // Find current page PDA
                const [pagePDA] = PublicKey.findProgramAddressSync(
                    [
                        Buffer.from("page"),
                        Buffer.from("doctrine"),
                        Buffer.from([id]),
                        new anchor.BN(doctrine.activePageNumber).toArrayLike(Buffer, 'le', 4)
                    ],
                    PROGRAM_ID
                );

                // Create message with exact IPFS CID length
                const ipfsCid = Buffer.alloc(46);
                Buffer.from(messageData.ipfs_cid).copy(ipfsCid);

                try {
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

                    console.log(`Added message ${messageData.message_index} to Doctrine ${id}. Tx:`, tx);
                } catch (error) {
                    console.error(`Error adding message ${messageData.message_index} to Doctrine ${id}:`, error);
                    throw error;
                }
            }
        }
    });
});
