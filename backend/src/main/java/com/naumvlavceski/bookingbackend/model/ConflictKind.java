package com.naumvlavceski.bookingbackend.model;

import io.swagger.v3.oas.annotations.media.Schema;

@Schema(description = "NEW_OVERLAP: a new imported booking overlaps a live booking, so it was not saved. "
        + "CHANGE_OVERLAP: new dates of an already imported booking would overlap, so its old dates were kept.")
public enum ConflictKind {
    NEW_OVERLAP, CHANGE_OVERLAP
}
