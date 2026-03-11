package com.finexatech.mock.bank;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Standalone mock SOAP endpoint.
 *
 * Accepts:  POST /soap/balance-service
 *           Content-Type: text/xml
 *           Body: SOAP envelope with <bank:accountNumber>
 *
 * Returns:  SOAP envelope with account balance details
 *
 * No CXF / JAX-WS needed — pure Spring MVC string handling.
 * Perfect for demo: any accountNumber gets a valid response.
 */
@RestController
@RequestMapping("/soap")
public class BankSoapController {

    private static final Logger log = LoggerFactory.getLogger(BankSoapController.class);

    private static final Pattern ACCOUNT_NUMBER_PATTERN =
        Pattern.compile("<[^:>]*:?accountNumber[^>]*>\\s*([^<]+?)\\s*</");

    private final AccountRegistry registry;

    public BankSoapController(AccountRegistry registry) {
        this.registry = registry;
    }

    /**
     * GetAccountBalance SOAP operation.
     * Extracts accountNumber from SOAP XML using regex — no XML parser dependency needed.
     */
    @PostMapping(
        value = "/balance-service",
        consumes = {MediaType.TEXT_XML_VALUE, MediaType.APPLICATION_XML_VALUE, MediaType.ALL_VALUE},
        produces = MediaType.TEXT_XML_VALUE
    )
    public String getAccountBalance(@RequestBody String soapRequest) {
        String accountNumber = extractAccountNumber(soapRequest);
        log.info("GetAccountBalance request → accountNumber={}", accountNumber);

        AccountRegistry.Account account = registry.find(accountNumber);
        String response = buildSoapResponse(account);

        log.info("GetAccountBalance response → holder={}, balance={} {}",
                 account.accountHolder(), account.balance(), account.currency());
        return response;
    }

    /**
     * WSDL endpoint — returns a basic WSDL so ESB/tools can discover the service.
     */
    @GetMapping(value = "/balance-service", produces = MediaType.TEXT_XML_VALUE)
    public String getWsdl() {
        return """
            <?xml version="1.0" encoding="UTF-8"?>
            <wsdl:definitions xmlns:wsdl="http://schemas.xmlsoap.org/wsdl/"
                              xmlns:soap="http://schemas.xmlsoap.org/wsdl/soap/"
                              xmlns:bank="http://bank.com/core"
                              targetNamespace="http://bank.com/core"
                              name="BankService">
              <wsdl:message name="GetAccountBalanceRequest">
                <wsdl:part name="accountNumber" type="xsd:string"/>
              </wsdl:message>
              <wsdl:message name="GetAccountBalanceResponse">
                <wsdl:part name="balance" type="xsd:string"/>
              </wsdl:message>
              <wsdl:portType name="BankServicePort">
                <wsdl:operation name="GetAccountBalance">
                  <wsdl:input message="bank:GetAccountBalanceRequest"/>
                  <wsdl:output message="bank:GetAccountBalanceResponse"/>
                </wsdl:operation>
              </wsdl:portType>
            </wsdl:definitions>
            """;
    }

    /**
     * Health check — plain JSON so monitoring tools can ping it.
     */
    @GetMapping(value = "/health", produces = MediaType.APPLICATION_JSON_VALUE)
    public String health() {
        return """
            {"status":"UP","service":"mock-bank-service","timestamp":"%s"}
            """.formatted(LocalDateTime.now().format(DateTimeFormatter.ISO_LOCAL_DATE_TIME));
    }

    // ── private helpers ────────────────────────────────────────────────────────

    private String extractAccountNumber(String soapXml) {
        Matcher m = ACCOUNT_NUMBER_PATTERN.matcher(soapXml);
        return m.find() ? m.group(1).trim() : "UNKNOWN";
    }

    private String buildSoapResponse(AccountRegistry.Account account) {
        String messageId = UUID.randomUUID().toString().substring(0, 8).toUpperCase();
        String timestamp = LocalDateTime.now().format(DateTimeFormatter.ISO_LOCAL_DATE_TIME);

        return """
            <?xml version="1.0" encoding="UTF-8"?>
            <soapenv:Envelope
                xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"
                xmlns:bank="http://bank.com/core">
              <soapenv:Header>
                <bank:MessageId>MSG-%s</bank:MessageId>
                <bank:Timestamp>%s</bank:Timestamp>
              </soapenv:Header>
              <soapenv:Body>
                <bank:GetAccountBalanceResponse>
                  <bank:accountNumber>%s</bank:accountNumber>
                  <bank:accountHolder>%s</bank:accountHolder>
                  <bank:balance>%s</bank:balance>
                  <bank:currency>%s</bank:currency>
                  <bank:accountType>%s</bank:accountType>
                  <bank:status>%s</bank:status>
                </bank:GetAccountBalanceResponse>
              </soapenv:Body>
            </soapenv:Envelope>
            """.formatted(
                messageId,
                timestamp,
                account.accountNumber(),
                account.accountHolder(),
                account.balance(),
                account.currency(),
                account.accountType(),
                account.status()
        );
    }
}
