package com.finexatech.esb.designer.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.web.servlet.FilterRegistrationBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.Ordered;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;
import org.springframework.web.filter.CorsFilter;

import java.util.List;

/**
 * Production-grade CORS configuration for ESB Designer (port 9191).
 *
 * Registered as a servlet Filter at HIGHEST_PRECEDENCE so CORS headers
 * are emitted on every path including pre-flight OPTIONS requests.
 *
 * Configure allowed origins in application.yaml:
 *   esb:
 *     cors:
 *       allowed-origins:
 *         - http://localhost:3000        # dev
 *         - https://esb.example.com     # prod UI
 */
@Configuration
public class CorsConfig {

    @Value("${esb.cors.allowed-origins:http://localhost:3000}")
    private List<String> allowedOrigins;

    @Bean
    public FilterRegistrationBean<CorsFilter> corsFilter() {
        CorsConfiguration config = new CorsConfiguration();
        config.setAllowedOrigins(allowedOrigins);
        config.setAllowedMethods(List.of("GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"));
        config.setAllowedHeaders(List.of(
                "Authorization", "Content-Type", "Accept",
                "Origin", "X-Requested-With", "X-Correlation-ID"
        ));
        config.setExposedHeaders(List.of("X-Correlation-ID", "Content-Type"));
        config.setMaxAge(3600L);
        config.setAllowCredentials(false);

        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/**", config);

        FilterRegistrationBean<CorsFilter> bean = new FilterRegistrationBean<>(new CorsFilter(source));
        bean.setOrder(Ordered.HIGHEST_PRECEDENCE);
        return bean;
    }
}
