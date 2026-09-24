package com.stellarsecurity.backgroundnotessync;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Collection;

/** One latest server record per ID; contains no Android or transport dependencies. */
final class DownloadAccumulator<T> {
    // Own SAM interfaces also work on Android 23 without Java-library desugaring.
    interface Id<T> { String apply(T item); }
    interface Version<T> { long applyAsLong(T item); }
    interface Deleted<T> { boolean test(T item); }
    private final Map<String, T> records = new LinkedHashMap<>();
    private final Id<T> id;
    private final Version<T> version;
    private final Deleted<T> deleted;

    DownloadAccumulator(Id<T> id, Version<T> version, Deleted<T> deleted) {
        this.id = id;
        this.version = version;
        this.deleted = deleted;
    }

    void add(T incoming) {
        if (incoming == null) return;
        String key = id.apply(incoming);
        if (key == null || key.isEmpty()) return;
        T previous = records.get(key);
        if (previous == null || version.applyAsLong(incoming) > version.applyAsLong(previous)
            || (version.applyAsLong(incoming) == version.applyAsLong(previous)
                && (!deleted.test(previous) || deleted.test(incoming)))) {
            records.put(key, incoming);
        }
    }

    Collection<T> values() { return records.values(); }

    Map<String, Long> knownVersions() {
        Map<String, Long> known = new LinkedHashMap<>();
        for (Map.Entry<String, T> entry : records.entrySet()) {
            long modified = version.applyAsLong(entry.getValue());
            if (modified > 0 && !deleted.test(entry.getValue())) known.put(entry.getKey(), modified);
        }
        return known;
    }
}
