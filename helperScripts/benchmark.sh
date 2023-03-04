#!/bin/bash

# Define a usage function
function usage {
    echo "Usage: $0 program num_times"
    echo "Where program is the program to run and num_times is the number of times to run it."
}

# Check if the number of arguments is correct
if [[ $# -ne 2 ]]; then
    usage
    exit 1
fi

# Get the program name and number of times to run
program=$1
programBase=(awk "{print $program}")
num_times=$2

# Check if the program exists and is executable
if ! type $programBase >/dev/null 2>&1; then
    echo "Error: $program is not a valid program or is not executable."
    usage
    exit 1
fi

# Define variables to hold the statistics
total_time=0
min_time=99999999
max_time=0

# Run the program the specified number of times
for ((i=1;i<=num_times;i++)); do
    echo "Running $program for the $i time..."
    start_time=$(date +%s%N)
    $program
    end_time=$(date +%s%N)
    time_taken=$((($end_time - $start_time)/1000000))
    echo "Time taken: $time_taken ms"
    total_time=$(($total_time + $time_taken))
    if [[ $time_taken -lt $min_time ]]; then
        min_time=$time_taken
    fi
    if [[ $time_taken -gt $max_time ]]; then
        max_time=$time_taken
    fi
done

# Calculate the average time
average_time=$(($total_time / $num_times))

# Print the statistics
echo "Statistics:"
echo "Total time taken: $total_time ms"
echo "Minimum time taken: $min_time ms"
echo "Maximum time taken: $max_time ms"
echo "Average time taken: $average_time ms"
