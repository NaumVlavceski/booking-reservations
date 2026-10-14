package com.naumvlavceski.bookingbackend.dto;

import java.util.List;

/** One page of a longer list, with what the client needs to draw "Page 2 of 7". */
public record PageResponse<T>(
        List<T> items,
        int page,
        int size,
        long totalElements,
        int totalPages
) {}
