package risklab;

import com.sun.net.httpserver.HttpServer;
import java.io.IOException;
import java.math.BigDecimal;
import java.net.InetSocketAddress;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Map;

/** Stateless API: does not store payments or execute trades. */
public final class Server {
    static BigDecimal number(Map<String,String> form, String key) {
        String value = form.get(key);
        if (value == null || value.length() > 24 || !value.matches("-?[0-9]+(\\.[0-9]{1,8})?"))
            throw new IllegalArgumentException("Invalid field: " + key);
        return new BigDecimal(value);
    }
    static Map<String,String> parse(String body) {
        Map<String,String> form = new HashMap<>();
        for (String entry : body.split("&")) {
            String[] pair = entry.split("=", 2);
            if (pair.length != 2) throw new IllegalArgumentException("Invalid form");
            String key = URLDecoder.decode(pair[0], StandardCharsets.UTF_8);
            if (form.putIfAbsent(key, URLDecoder.decode(pair[1], StandardCharsets.UTF_8)) != null)
                throw new IllegalArgumentException("Duplicate field");
        }
        return form;
    }
    public static String calculate(String body) {
        var f = parse(body);
        var p = new Exposure.Position("API", f.getOrDefault("currency", ""), number(f,"amount"),
                number(f,"referenceRate"), number(f,"fixedFraction"), number(f,"fixedRate"), number(f,"localCost"));
        var c = Exposure.price(p, number(f,"shock"));
        return "{\"engine\":\"java-bigdecimal\",\"baseline\":"+c.baseline()+",\"stressed\":"+c.stressed()+",\"impact\":"+c.impact()+"}";
    }
    public static void main(String[] args) throws IOException {
        int port = Integer.parseInt(System.getenv().getOrDefault("PORT", "8080"));
        var server = HttpServer.create(new InetSocketAddress(port), 32);
        server.createContext("/health", exchange -> {
            byte[] payload = "{\"status\":\"ok\",\"engine\":\"java-bigdecimal\"}".getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().set("Content-Type","application/json");
            exchange.sendResponseHeaders(200,payload.length);
            try(var out=exchange.getResponseBody()){out.write(payload);}
        });
        server.createContext("/api/price", exchange -> {
            int status = 200; String response;
            try {
                if (!exchange.getRequestMethod().equals("POST")) {
                    status=405; response="{\"error\":\"POST required\"}";
                } else if (!exchange.getRequestHeaders().getFirst("Content-Type").startsWith("application/x-www-form-urlencoded")) {
                    status=415; response="{\"error\":\"Form encoding required\"}";
                } else {
                    byte[] bytes = exchange.getRequestBody().readNBytes(4097);
                    if(bytes.length>4096) throw new IllegalArgumentException("Body exceeds 4096 bytes");
                    response=calculate(new String(bytes,StandardCharsets.UTF_8));
                }
            } catch (IllegalArgumentException | NullPointerException ex) {
                status=400; response="{\"error\":\"Invalid costing input\"}";
            }
            byte[] payload=response.getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().set("Content-Type","application/json");
            exchange.getResponseHeaders().set("Cache-Control","no-store");
            exchange.sendResponseHeaders(status,payload.length);
            try(var out=exchange.getResponseBody()){out.write(payload);}
        });
        server.start();
        System.out.println("RiskLab Java API listening on " + port);
    }
}
