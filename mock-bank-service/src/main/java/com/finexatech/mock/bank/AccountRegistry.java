package com.finexatech.mock.bank;

import org.springframework.stereotype.Component;

import java.util.Map;

/**
 * In-memory account database.
 * Every account number not listed here gets a generated balance
 * so the demo works with any account number from the mobile app.
 */
@Component
public class AccountRegistry {

    public record Account(
        String accountNumber,
        String accountHolder,
        String balance,
        String currency,
        String accountType,
        String status
    ) {}

    private static final Map<String, Account> ACCOUNTS = Map.of(
        "99999", new Account("99999", "Mohammed Al-Rashid",  "125,430.00", "SAR", "CURRENT",  "ACTIVE"),
        "11111", new Account("11111", "Ahmed Al-Farsi",       "45,200.50",  "SAR", "SAVINGS",  "ACTIVE"),
        "22222", new Account("22222", "Fatima Al-Zahra",      "8,750.75",   "USD", "CURRENT",  "ACTIVE"),
        "33333", new Account("33333", "Khalid Al-Otaibi",     "320,000.00", "SAR", "CORPORATE","ACTIVE"),
        "44444", new Account("44444", "Sara Al-Qahtani",      "1,200.00",   "SAR", "SAVINGS",  "FROZEN"),
        "55555", new Account("55555", "Omar Al-Harbi",        "67,890.25",  "USD", "CURRENT",  "ACTIVE"),
        "12345", new Account("12345", "John Smith",           "2,500.75",   "USD", "SAVINGS",  "ACTIVE")
    );

    public Account find(String accountNumber) {
        return ACCOUNTS.getOrDefault(
            accountNumber,
            // Any unknown account gets a generated response — good for live demo
            new Account(
                accountNumber,
                "Account Holder " + accountNumber,
                String.format("%,.2f", (accountNumber.hashCode() & 0xFFFFL) + 1000.0),
                "SAR",
                "CURRENT",
                "ACTIVE"
            )
        );
    }
}
