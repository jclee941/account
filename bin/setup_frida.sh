#!/bin/bash
FRIDA_VERSION="17.8.2"
ARCH="android-x86_64"
URL="https://github.com/frida/frida/releases/download/${FRIDA_VERSION}/frida-server-${FRIDA_VERSION}-${ARCH}.xz"

echo "Downloading Frida ${FRIDA_VERSION} for ${ARCH}..."
curl -L ${URL} -o frida-server.xz

echo "Extracting..."
unxz frida-server.xz

echo "Pushing to device..."
adb root
adb push frida-server /data/local/tmp/frida-server
adb shell "chmod 755 /data/local/tmp/frida-server"
adb shell "/data/local/tmp/frida-server &"
echo "Frida server is running in background."
