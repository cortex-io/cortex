#!/usr/bin/env bash
echo "Arg 1: $1"
echo "Arg 2: $2"
echo "Arg 2 length: ${#2}"
printf "Arg 2 hex: "
echo -n "$2" | xxd -p
echo ""
