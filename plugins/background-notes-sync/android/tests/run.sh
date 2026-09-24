#!/bin/sh
set -eu
sync_test_root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
sync_test_output=$(mktemp -d)
trap 'rm -rf "$sync_test_output"' EXIT
javac --release 8 -Xlint:-options -d "$sync_test_output"   "$sync_test_root/src/main/java/com/stellarsecurity/backgroundnotessync/DownloadAccumulator.java"   "$sync_test_root/tests/DownloadAccumulatorTest.java"
java -cp "$sync_test_output" com.stellarsecurity.backgroundnotessync.DownloadAccumulatorTest
