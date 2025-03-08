#!/bin/bash

# Usage: ./scp-parallel.bash SRC_DIR REMOTE_HOST DST_DIR
# Example: ./scp-parallel.bash /local/data user@server.com:/remote/data

if [ $# -ne 3 ]; then
    echo "Usage: $0 SRC_DIR REMOTE_HOST DST_DIR"
    exit 1
fi

SRC_DIR="${1%/}"    # Remove trailing slash if present
REMOTE_HOST="$2"
DST_DIR="${3%/}"    # Remove trailing slash if present

# Create batch files for transfers
TEMP_DIR=$(mktemp -d)
MAX_BATCHES=5
batch_files=()

echo "Creating batch transfer files..."

# Create the remote directory structure first (in a single SSH connection)
find "$SRC_DIR" -type d | sed -e "s|^$SRC_DIR||" | grep -v "^$" | sort > "$TEMP_DIR/dirs.txt"
if [ -s "$TEMP_DIR/dirs.txt" ]; then
    echo "Creating remote directories..."
    cat "$TEMP_DIR/dirs.txt" | ssh "$REMOTE_HOST" "xargs -I{} mkdir -p \"$DST_DIR/{}\""
fi

# Create batch files (split file list into MAX_BATCHES parts)
for ((i=0; i<$MAX_BATCHES; i++)); do
    batch_files[$i]="$TEMP_DIR/batch_$i.txt"
    touch "${batch_files[$i]}"
done

# Distribute files across batch files
count=0
find "$SRC_DIR" -type f | while read -r file; do
    rel_path="${file#$SRC_DIR/}"
    echo "$file:$DST_DIR/$(dirname "$rel_path")/" >> "${batch_files[$((count % MAX_BATCHES))]}"
    count=$((count + 1))
done

# Start transfers in parallel
for ((i=0; i<$MAX_BATCHES; i++)); do
    if [ -s "${batch_files[$i]}" ]; then
        echo "Starting batch $((i+1))..."
        (
            # Use a control connection with ControlMaster to reuse SSH connection
            ssh_control="$TEMP_DIR/control_$i"
            ssh -o "ControlMaster=yes" -o "ControlPath=$ssh_control" -o "ControlPersist=yes" "$REMOTE_HOST" "echo 'SSH connection established for batch $((i+1))'"
            
            # Process each file in the batch
            while IFS=: read -r src_file dst_dir; do
                echo "Copying: $src_file, batch $i"
                scp -q -o "ControlPath=$ssh_control" "$src_file" "$REMOTE_HOST:$dst_dir"
            done < "${batch_files[$i]}"
            
            # Close the control connection
            ssh -O exit -o "ControlPath=$ssh_control" "$REMOTE_HOST" 2>/dev/null || true
        ) &
    fi
done

# Wait for all transfers to complete
echo "Waiting for all transfers to complete..."
wait

# Cleanup
rm -rf "$TEMP_DIR"
echo "All transfers completed!"