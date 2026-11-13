package com.naumvlavceski.bookingbackend.audit.platform;

import com.naumvlavceski.bookingbackend.audit.AuditTestBase;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;

import java.util.List;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;

/** OPS-07 (V26__query_indexes.sql): the indexes behind the calendar, cancelled-list, room and feed lookups exist. */
class QueryIndexesAuditTest extends AuditTestBase {

    @Autowired JdbcTemplate jdbc;

    @Test
    void theV26IndexesExist() {
        List<String> names = jdbc.queryForList("select indexname from pg_indexes where schemaname = 'public'", String.class);
        for (String index : List.of("idx_reservation_owner_checkin", "idx_reservation_unit", "idx_reservation_owner_cancelled",
                "idx_unit_ical_token", "idx_app_user_owner",
                "idx_app_user_email_upper", "idx_external_event_reservation")) {
            assertTrue(names.contains(index), "missing index " + index);
        }
    }

    @Test
    void theCalendarQueryCanUseTheOwnerIndex() {
        jdbc.execute("set enable_seqscan = off"); // force the planner to show whether an index is usable at all
        try {
            String plan = String.join("\n", jdbc.queryForList(
                    "explain select * from reservation where owner_id = '" + UUID.randomUUID() + "'", String.class));
            assertTrue(plan.contains("idx_reservation_owner_checkin"), plan);
        } finally {
            jdbc.execute("set enable_seqscan = on");
        }
    }
}
