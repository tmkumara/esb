package com.finexatech.mock.bank;

import jakarta.annotation.PostConstruct;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

@Component
public class StartupBanner {

    private static final Logger log = LoggerFactory.getLogger(StartupBanner.class);

    @Value("${server.port:8085}")
    private int port;

    @PostConstruct
    public void print() {
        log.info("");
        log.info("╔══════════════════════════════════════════════════════╗");
        log.info("║         MOCK BANK SOAP SERVICE  — STARTED           ║");
        log.info("╠══════════════════════════════════════════════════════╣");
        log.info("║  SOAP Endpoint : http://0.0.0.0:{}/soap/balance-service  ║", port);
        log.info("║  WSDL          : GET  /soap/balance-service          ║");
        log.info("║  Health        : GET  /soap/health                   ║");
        log.info("╠══════════════════════════════════════════════════════╣");
        log.info("║  Pre-loaded accounts:                                ║");
        log.info("║   99999 → Mohammed Al-Rashid  125,430 SAR            ║");
        log.info("║   11111 → Ahmed Al-Farsi       45,200 SAR            ║");
        log.info("║   22222 → Fatima Al-Zahra       8,750 USD            ║");
        log.info("║   33333 → Khalid Al-Otaibi    320,000 SAR            ║");
        log.info("║   55555 → Omar Al-Harbi        67,890 USD            ║");
        log.info("║   12345 → John Smith            2,500 USD            ║");
        log.info("║  Any other account → auto-generated balance          ║");
        log.info("╚══════════════════════════════════════════════════════╝");
        log.info("");
    }
}
