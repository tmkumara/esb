package com.finexatech.esb.runtime.mock;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Profile;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.*;

/**
 * DEMO ONLY — Mock SOAP server running inside the same Spring Boot app.
 * Active only with Spring profile "demo" (default in application.yaml).
 *
 * In real integration: this is your actual SOAP backend.
 * Remove this class and set SOAP_CUSTOMER_URL to the real endpoint.
 *
 * Simulates:
 *   POST /mock/soap/customer-service → returns SOAP XML response
 *   POST /mock/soap/order-service    → returns SOAP XML response
 */
@RestController
@RequestMapping("/mock/soap")
@Profile("demo")
public class MockSoapController {

    private static final Logger log = LoggerFactory.getLogger(MockSoapController.class);

    @PostMapping(
        value = "/customer-service",
        consumes = {"text/xml", "application/soap+xml", "application/json", "*/*"},
        produces = MediaType.TEXT_XML_VALUE
    )
    public String getCustomer(@RequestBody(required = false) String requestBody,
                               @RequestHeader(value = "SOAPAction", required = false) String soapAction) {

        log.info("Mock SOAP: received request [SOAPAction={}] body-length={}",
                 soapAction, requestBody != null ? requestBody.length() : 0);

        // Return a canned SOAP response — simulates a real SOAP service
        return """
            <?xml version="1.0" encoding="UTF-8"?>
            <soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
              <soap:Header>
                <responseTime>42ms</responseTime>
              </soap:Header>
              <soap:Body>
                <GetCustomerResponse xmlns="http://finexatech.com/customer/v1">
                  <customer>
                    <id>CUST001</id>
                    <firstName>John</firstName>
                    <lastName>Doe</lastName>
                    <email>john.doe@example.com</email>
                    <accountType>PREMIUM</accountType>
                    <status>ACTIVE</status>
                    <creditLimit>50000.00</creditLimit>
                  </customer>
                  <metadata>
                    <source>MOCK_CRM</source>
                    <timestamp>2025-01-01T12:00:00Z</timestamp>
                  </metadata>
                </GetCustomerResponse>
              </soap:Body>
            </soap:Envelope>
            """;
    }

    @PostMapping(
        value = "/balance-service",
        consumes = {"text/xml", "application/soap+xml", "*/*"},
        produces = MediaType.TEXT_XML_VALUE
    )
    public String getAccountBalance(@RequestBody(required = false) String requestBody,
                                    @RequestHeader(value = "SOAPAction", required = false) String soapAction) {

        log.info("Mock SOAP Balance: received [SOAPAction={}] body-length={}",
                 soapAction, requestBody != null ? requestBody.length() : 0);

        // In a real system this would query a database using the accountId from the SOAP body.
        // For demo: return a fixed balance response.
        return """
            <?xml version="1.0" encoding="UTF-8"?>
            <soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
              <soap:Body>
                <GetAccountBalanceResponse xmlns="http://bank.com/core">
                  <accountNumber>12345</accountNumber>
                  <accountHolder>John Smith</accountHolder>
                  <balance>2500.75</balance>
                  <currency>USD</currency>
                </GetAccountBalanceResponse>
              </soap:Body>
            </soap:Envelope>
            """;
    }

    @PostMapping(
        value = "/order-service",
        consumes = {"text/xml", "application/soap+xml", "application/json", "*/*"},
        produces = MediaType.TEXT_XML_VALUE
    )
    public String submitOrder(@RequestBody(required = false) String requestBody,
                               @RequestHeader(value = "SOAPAction", required = false) String soapAction) {

        log.info("Mock SOAP Order: received [SOAPAction={}]", soapAction);

        return """
            <?xml version="1.0" encoding="UTF-8"?>
            <soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
              <soap:Body>
                <SubmitOrderResponse xmlns="http://finexatech.com/order/v1">
                  <orderId>ORD-2025-001234</orderId>
                  <status>ACCEPTED</status>
                  <message>Order accepted for processing</message>
                  <estimatedCompletion>2025-01-01T12:05:00Z</estimatedCompletion>
                </SubmitOrderResponse>
              </soap:Body>
            </soap:Envelope>
            """;
    }
}
