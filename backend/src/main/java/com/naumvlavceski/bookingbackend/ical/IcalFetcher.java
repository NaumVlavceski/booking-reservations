package com.naumvlavceski.bookingbackend.ical;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;

public class IcalFetcher {
    private static final int MAX_BYTES = 5 * 1024 * 1024;
    private static final Duration TIMEOUT = Duration.ofSeconds(15);
    private static final int MAX_RETRIES = 2;

    private static final HttpClient CLIENT = HttpClient.newBuilder()
            .connectTimeout(TIMEOUT)
            .build();
    public static String fetch(String url) throws IcalFetchException{
        Exception lastError = null;
        for (int attempt = 0; attempt <= MAX_RETRIES; attempt++) {
            try {
                HttpRequest request = HttpRequest.newBuilder()
                        .uri(URI.create(url))
                        .timeout(TIMEOUT)
                        .GET()
                        .build();
                HttpResponse<String> response = CLIENT.send(request, HttpResponse.BodyHandlers.ofString());
                if (response.statusCode() != 200) {
                    throw new IcalFetchException("Feed returned HTTP " + response.statusCode());
                }
                if (response.body().length() > MAX_BYTES) {
                    throw new IcalFetchException("Feed exceeded size cap (" + MAX_BYTES + " bytes)");
                }
                if (!response.body().contains("BEGIN:VCALENDAR")) {
                    throw new IcalFetchException("Response is not an iCal feed");
                }
                return response.body();

            }catch (IcalFetchException e){
                throw e;
            }catch (Exception e){
                lastError = e;
            }
        }
        throw new IcalFetchException("Failed after " + (MAX_RETRIES + 1) + " attempts: " + lastError.getMessage());
    }
}
