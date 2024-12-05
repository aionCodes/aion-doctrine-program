# Aion Doctrine Program

Aion Doctrine program is a message storage and management program operating on the Solana blockchain.

## Documentation

- [System Design](docs/system-design.md): Core components and architecture explanation
- [Test Guide](docs/tests/test-guide.md): Test environment setup and execution guide

## Setup Guide

### Configure Solana
```bash
# Set Solana config with increased timeout for better deployment stability
# Replace YOUR_RPC_URL with your actual RPC endpoint (e.g., from QuickNode, Alchemy, etc.)
solana config set \
  --url YOUR_RPC_URL \
  --rpc-timeout 180
```

### Generate Program Keypair
```bash
solana-keygen new -o programs/aion/aion-keypair.json --no-bip39-passphrase --force
```

## Test Guide

For the full test scenario and execution guide, please refer to the [Test Guide](docs/tests/test-guide.md).

The test guide includes:
- Test environment setup
- Full test scenario and order
- Purpose and execution method of each test
- Test data state
- Precautions

#git push needed after change program id 
### Verifiable Program
```bash
anchor build --verifiable

solana program deploy -v --program-id programs/aion/aion-keypair.json --upgrade-authority /home/aion/id.json ./target/verifiable/aion.so

#when redeploy is needed
solana-keygen recover -o buffer-keypair.json

solana program deploy -v --program-id programs/aion/aion-keypair.json --upgrade-authority /home/aion/id.json --buffer buffer-keypair.json ./target/verifiable/aion.so

solana-verify verify-from-repo --remote --program-id <PROGRAM_ID> {{GITHUB_URL}}
```

### Initialize IDL
After deploying the program, initialize the IDL (Interface Description Language) account:
```bash
anchor idl init -f target/idl/aion.json <PROGRAM_ID>
```

### Run Tests
```bash
anchor test tests/test_name.ts --skip-deploy
```

### Make Program Immutable
After deploying the program, you can make it immutable by removing the upgrade authority. This ensures that the Aion doctrine program cannot be modified and remains eternal:
```bash
solana program set-upgrade-authority <PROGRAM_ID> --final