
# Simple Transaction Processor

## Instructions

Welcome to the programming assessment. Your task is to fix a bug and complete a simple transaction processing script within `main.py`.

The script is designed to perform two main functions:
1.  Parse a list of transactions from a raw JSON string.
2.  Calculate the final account balance and summarize total expenses by category.

### Part 1: Debugging

The `parse_transactions` function is not working as expected. It's failing to process all valid transaction types correctly. Your first task is to identify and fix this bug.

### Part 2: Implementation

The `calculate_balance_and_categorize` function is incomplete. You need to implement its logic to:
1.  Calculate the final balance by summing up `credit` amounts and subtracting `debit` amounts.
2.  Aggregate the total spending for each expense category from `debit` transactions.

## Requirements

- The script must run without errors after your changes.
- The output should match the "Expected Output" section below.
- Your code should be clean, readable, and handle potential data inconsistencies gracefully (e.g., a transaction missing an expected field).

## Sample Input

The input is provided as a multi-line JSON string within `main.py`:

```json
[
    {"id": 1, "type": "credit", "amount": 100.0, "description": "Paycheck"},
    {"id": 2, "type": "debit", "amount": 25.5, "description": "Groceries", "category": "Food"},
    {"id": 3, "type": "debit", "amount": 12.0, "description": "Coffee", "category": "Food"},
    {"id": 4, "type": "credit", "amount": 50.0, "description": "Refund"},
    {"id": 5, "type": "debit", "amount": 5.0, "description": "Parking", "category": "Transport"},
    {"id": 6, "type": "invalid", "amount": 100.0, "description": "Invalid Data"}
]
```

## Expected Output

```
Final Balance: 107.5
---
Expenses by Category:
Food: 37.5
Transport: 5.0
```
