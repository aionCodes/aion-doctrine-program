# Aion Test Guide

This document explains the testing process and purpose of each test for the Aion program.

[English Version](test-guide.en.md)

### Test Execution Format
All tests should be run in the following format:
```bash
anchor test tests/test_name.ts --skip-deploy
```
The `--skip-deploy` flag prevents program redeployment during test execution.

## Test Scenarios

### 1. System Initialization Test
**File:** `tests/initialize_system.ts`
```bash
anchor test tests/initialize_system.ts --skip-deploy
```
**Purpose:**
- Initialize Config account
- Verify initial settings (message cost, messages per page, etc.)

### 2. Doctrine Initialization Test
**File:** `tests/initialize_doctrine.ts`
```bash
anchor test tests/initialize_doctrine.ts --skip-deploy
```
**Purpose:**
- Initialize Doctrines 1 through 10
- Validate initial state of each Doctrine

### 3. Add Message to Current Page Test
**File:** `tests/add_messages_to_current_page.ts`
```bash
anchor test tests/add_messages_to_current_page.ts --skip-deploy
```
**Purpose:**
- Test single message addition functionality
- Verify basic message addition features

### 4. Fill Doctrine Status Test
**File:** `tests/make_full_doctrine_status.ts`
```bash
anchor test tests/make_full_doctrine_status.ts --skip-deploy
```
**Purpose:**
- Fill first page of Doctrine 1 with 100 messages
- Create a full page state

### 5. Page Transition Test
**File:** `tests/test_page_transition_instructions.ts`
```bash
anchor test tests/test_page_transition_instructions.ts --skip-deploy
```
**Purpose:**
- Attempt to add message to full page (verify failure)
- Add message with page transition (verify success)
- Validate page transition logic

### 6. Add Message to Active Page Test
**File:** `tests/test_add_message_to_active_page.ts`
```bash
anchor test tests/test_add_message_to_active_page.ts --skip-deploy
```
**Purpose:**
- Find active page of Doctrine 1
- Add message to that page
- Verify active page management logic

### 7. Read Messages Test
**File:** `tests/read_messages.ts`
```bash
anchor test tests/read_messages.ts --skip-deploy
```
**Purpose:**
- Check status of all Doctrines
- Verify message content in each page
- Validate results of previous tests

## Precautions
1. Tests must be executed in the order specified above
2. Each test depends on the state created by previous tests
3. Use the `--skip-deploy` flag to prevent unnecessary redeployment
