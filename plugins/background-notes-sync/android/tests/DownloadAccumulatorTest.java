package com.stellarsecurity.backgroundnotessync;

import java.util.ArrayList;

/** Run directly with javac/java. No test frameworks or Android runtime required. */
public final class DownloadAccumulatorTest {
    static final class Record {
        final String id; final long version; final boolean deleted; final String body;
        Record(String id, long version, boolean deleted, String body) {
            this.id=id; this.version=version; this.deleted=deleted; this.body=body;
        }
    }
    static DownloadAccumulator<Record> cache() {
        return new DownloadAccumulator<>(r -> r.id, r -> r.version, r -> r.deleted);
    }
    static void check(String name, boolean condition) {
        if (!condition) throw new AssertionError(name);
        System.out.println("PASS: " + name);
    }
    public static void main(String[] args) {
        DownloadAccumulator<Record> cache=cache();
        check("empty inbox requests full data", cache.knownVersions().isEmpty());
        for (int response=0; response<20; response++) {
            for (int note=0; note<1000; note++) cache.add(new Record("note-"+note,100,false,"cipher"));
        }
        check("20 full responses compact to 1000 records",cache.values().size()==1000);
        check("manifest advertises exactly staged records",cache.knownVersions().size()==1000);
        cache.add(new Record("note-1",200,false,"new"));
        cache.add(new Record("note-1",150,false,"stale"));
        check("out of order updates retain latest",cache.knownVersions().get("note-1")==200);
        cache.add(new Record("note-1",200,true,""));
        cache.add(new Record("note-1",200,false,"stale"));
        check("equal timestamp cannot resurrect tombstone",!cache.knownVersions().containsKey("note-1"));
        check("tombstone remains staged",cache.values().size()==1000);
        cache.add(new Record("note-1",201,false,"restored"));
        check("newer explicit restore wins",cache.knownVersions().get("note-1")==201);
        for (int i=0;i<40;i++) cache.add(new Record("delta-"+i,300+i,false,"delta"));
        check("more than 20 deltas lose no unique records",cache.values().size()==1040);
        cache.add(null); cache.add(new Record("",100,false,"invalid"));
        check("invalid records are excluded",cache.values().size()==1040);
        cache.add(new Record("unknown-version",0,false,"legacy"));
        check("unknown version is not suppressed",!cache.knownVersions().containsKey("unknown-version"));
        DownloadAccumulator<Record> restarted=cache();
        for (Record record: new ArrayList<>(cache.values())) restarted.add(record);
        check("restart reconstructs same known versions",restarted.knownVersions().equals(cache.knownVersions()));
        check("consumed or cleared inbox resets manifest",cache().knownVersions().isEmpty());
        DownloadAccumulator<Record> oldServer=cache();
        for (Record record: cache.values()) oldServer.add(record);
        for (Record record: cache.values()) oldServer.add(record);
        check("old server full response is safe to repeat",oldServer.values().size()==cache.values().size());
    }
}
