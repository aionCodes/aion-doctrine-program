# Aion System Design

Aion is a message storage and management system operating on the Solana blockchain. This document explains the core design and components of the system.

## Core Components

### 1. System Configuration (SystemConfig)
- Manages overall system settings
- Stores system authority and token mint address
- PDA seed: "config"

### 2. Doctrine
- Top-level container for storing messages
- Doctrine ID: Limited to values between 1-10
- Each doctrine consists of multiple pages
- Key attributes:
  - authority: Doctrine owner
  - doctrine_id: Doctrine identifier
  - total_messages: Total message count
  - current_page: Currently active page
  - messages_per_page: Messages per page (fixed at 100)
  - current_page_message_count: Message count in current page
  - latest_page_number: Last page number

### 3. Doctrine Page
- Container that stores actual messages
- Each page can store up to 100 messages
- PDA seed: "page"
- Key attributes:
  - doctrine: Parent doctrine address
  - page_number: Page number
  - messages: Array of messages containing IPFS CID and timestamp

### 4. Message
- Consists of IPFS CID (46 bytes) and timestamp
- Actual message content stored through IPFS
- Message storage cost:
  - Initial cost: 100,000 tokens
  - Cost increase rate: 1% (101/100)

## Core Functions

### 1. System Initialization
- `initialize_system`: Initialize system configuration
- Set authority and token mint

### 2. Doctrine Management
- `initialize_doctrine`: Create new doctrine
- Validate doctrine ID (1-10)

### 3. Message Addition
1. `add_message_to_current_page`: Add message to current page
   - Used when page is not full
   - Handle message cost calculation and token transfer

2. `add_message_to_new_page`: Add message to new page
   - Used when current page is full
   - Create new page and store message

## Events

The system emits events for key operations:
1. `SystemInitializedEvent`: System initialization complete
2. `DoctrineInitializedEvent`: New doctrine created
3. `MessageAddedEvent`: Message addition complete

## Error Handling

Key error codes:
- InvalidDoctrineId: Invalid doctrine ID
- PageFull: Page is full
- InvalidPage: Invalid page access
- InsufficientTokens: Insufficient tokens
- InvalidCostCalculation: Cost calculation error

---
