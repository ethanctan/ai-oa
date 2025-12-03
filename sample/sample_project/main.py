
import json
from collections import defaultdict

TRANSACTION_DATA = """
[
    {"id": 1, "type": "credit", "amount": 100.0, "description": "Paycheck"},
    {"id": 2, "type": "debit", "amount": 25.5, "description": "Groceries", "category": "Food"},
    {"id": 3, "type": "debit", "amount": 12.0, "description": "Coffee", "category": "Food"},
    {"id": 4, "type": "credit", "amount": 50.0, "description": "Refund"},
    {"id": 5, "type": "debit", "amount": 5.0, "description": "Parking", "category": "Transport"},
    {"id": 6, "type": "invalid", "amount": 100.0, "description": "Invalid Data"}
]
"""

def parse_transactions(data: str) -> list:
    """
    Parses transaction data from a JSON string.

    BUG: This function only processes 'debit' transactions and ignores all others.
    """
    transactions = json.loads(data)
    valid_transactions = []
    for t in transactions:
        if t.get("type") == "debit":
            valid_transactions.append(t)
    return valid_transactions

def calculate_balance_and_categorize(transactions: list) -> (float, dict):
    """
    Calculates the final balance and categorizes expenses.

    TODO: This function is not implemented. The candidate needs to write the logic.
    """
    balance = 0.0
    expenses_by_category = defaultdict(float)

    # --- IMPLEMENT LOGIC HERE ---

    return balance, dict(expenses_by_category)


def main():
    """
    Main function to process transactions and print the summary.
    """
    # Part 1: The candidate should fix the bug in this function call.
    parsed_transactions = parse_transactions(TRANSACTION_DATA)

    # Part 2: The candidate should implement the logic in this function.
    balance, expenses = calculate_balance_and_categorize(parsed_transactions)

    print(f"Final Balance: {balance}")
    print("---")
    print("Expenses by Category:")
    if not expenses:
        print("None")
    else:
        for category, amount in expenses.items():
            print(f"{category}: {amount}")

if __name__ == "__main__":
    main()
