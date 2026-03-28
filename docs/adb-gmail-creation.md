# ADB Gmail Account Creation Runbook

This runbook documents the manual Android + ADB workflow that produced the successful `created:adb` entries for `qws94302`, `qws94303`, and `qws94304` in `accounts.csv`.

It is meant for the cases where desktop Playwright runs hit Google blocks such as `error:blocked:qr_code_verification`, but the same account can still be created on a real Android device through Chrome.

## Known Successful Pattern

The confirmed successful rows are:

- `qws94302,qws94302@gmail.com,...,created:adb`
- `qws94303,qws94303@gmail.com,...,created:adb`
- `qws94304,qws94304@gmail.com,...,created:adb`

Common pattern from those rows:

- Username prefix: `qws943XX`
- Password: `bingogo1`
- Status written back to CSV: `created:adb`
- Timestamp format: ISO 8601 UTC, for example `2026-03-15T00:00:00.000Z`

## Prerequisites

You need all of the following before starting:

- Android phone connected to the host by USB **OR** Android Emulator running
- USB debugging enabled on the Android device (or emulator)
- `adb` installed on the host machine
- Google Chrome installed on the Android device/emulator
- 5sim account with working API key and enough balance for Google SMS verification
- A prepared account row in `accounts.csv` with username, email, password, and names

**Device Options:**
1. **Real Android Device** - Physical phone with USB cable
2. **Android Emulator** - Use Android Studio emulator or command-line emulator (works the same as real device)

- Android phone connected to the host by USB
- USB debugging enabled on the Android device
- `adb` installed on the host machine
- Google Chrome installed on the Android device
- 5sim account with working API key and enough balance for Google SMS verification
- A prepared account row in `accounts.csv` with username, email, password, and names

Recommended host-side check:

```bash
adb version
adb devices
```

If the device is listed as `unauthorized`, unlock the phone and accept the RSA fingerprint prompt.

## Device Setup

### 1. Enable Developer Options

On the Android device:

1. Open `Settings`
2. Open `About phone`
3. Tap `Build number` seven times
4. Enter the device PIN if Android asks for confirmation
5. Confirm that `Developer options` is now visible

### 2. Enable USB Debugging

On the Android device:

1. Open `Settings`
2. Open `Developer options`
3. Turn on `USB debugging`
4. Keep the device unlocked when first connecting to the host
5. Accept the `Allow USB debugging` prompt

### 3. Verify ADB Connectivity

Run on the host:

```bash
adb devices
```

Expected result:

```text
List of devices attached
R3XXXXXXXXXX    device
```

If needed, reset the ADB server:

```bash
adb kill-server
adb start-server
adb devices
```

## Emulator Setup (Alternative to Real Device)

If you don't have a physical Android device, you can use the Android Emulator.

### 1. Install Android Emulator

**Option A: Android Studio (Recommended)**
1. Download and install Android Studio
2. Open SDK Manager → SDK Tools → Install "Android Emulator"
3. Create a new Virtual Device (AVD):
   - Phone: Pixel 7 or similar
   - System Image: Android 13 (API 33) or Android 14 (API 34)
   - Enable "Hardware GLES 2.0" for better performance

**Option B: Command Line (emulator)**
```bash
# Install Android SDK command line tools
sdkmanager "system-images;android-33;google_apis;x86_64"
sdkmanager "platform-tools"
sdkmanager "emulator"

# Create AVD
avdmanager create avd -n pixel7 -k "system-images;android-33;google_apis;x86_64" -d pixel_7

# Start emulator
emulator -avd pixel7 -no-snapshot-load
```

### 2. Configure Emulator for ADB

The emulator automatically exposes ADB on port 5554+:

```bash
# Check emulator is detected
adb devices

# Expected output:
# List of devices attached
# emulator-5554   device
```

### 3. Install Chrome on Emulator

If Chrome is not pre-installed:

```bash
# Download Chrome APK from APKMirror or similar
# Install via ADB
adb install chrome-stable.apk
```

### 4. Emulator Tips

- **Performance**: Enable hardware acceleration (HAXM on Intel, Hypervisor.Framework on Apple Silicon)
- **Persistence**: Use `-no-snapshot-load` flag to start fresh each time
- **Resolution**: Set to 1080x1920 or similar phone resolution for consistent coordinates
- **Network**: Emulator shares host network, so proxy settings apply

### 5. Differences from Real Device

| Aspect | Real Device | Emulator |
|--------|-------------|----------|
| Trust score | Higher (real hardware) | Lower (detectable as emulator) |
| Phone number | Real SIM needed | Virtual number only |
| SMS via 5sim | Works | Works (same network) |
| Setup time | Faster (already configured) | Slower (boot + setup) |
| Cost | Free (if you have phone) | Free (software only) |

**Note**: Some Google services may detect the emulator. If you hit issues, try:
- Using a real device for better trust signals
- Enabling emulator hardware profile with Play Store
- Using Android 12/13 instead of latest version



## Account Data Preparation

Before touching the phone, decide which row you are creating.

Example based on successful entries:

- Username: `qws94302`
- Email: `qws94302@gmail.com`
- Password: `bingogo1`
- First name: `Hyunwoo`
- Last name: `Jung`
- Korean name: `정현우`

Important notes from the existing automation:

- The repo uses `accounts.google.com/signup` as the main signup entry point.
- The age/phone flows are locale-aware and often show Korean UI.
- The phone-verification scripts prioritize the Korean text `전화번호 인증` when deciding whether the verification step is active.
- The 5sim flow in `account/create-accounts.mjs` and `account/verify-age.mjs` treats number lifecycle carefully: buy number, wait for code, finish on success, cancel on failure or timeout.

## Account Creation Process

### 1. Wake and unlock the device

Use ADB to wake the device:

```bash
adb shell input keyevent KEYCODE_WAKEUP
adb shell wm dismiss-keyguard
```

If the phone still stays on the lock screen, unlock it manually.

### 2. Launch Chrome on the Android device

Primary command:

```bash
adb shell am start -n com.android.chrome/com.google.android.apps.chrome.Main
```

If Chrome is already running and behaving strangely, force-stop it first:

```bash
adb shell am force-stop com.android.chrome
adb shell am start -n com.android.chrome/com.google.android.apps.chrome.Main
```

Give Chrome a few seconds to finish loading.

### 3. Open the Google signup page

Use an Android intent so Chrome opens the target URL directly:

```bash
adb shell am start -a android.intent.action.VIEW -d "https://accounts.google.com/signup"
```

If Chrome asks to accept terms, dismiss popups, or choose an account, handle that first with manual taps or `adb shell input tap x y`.

### 4. Fill the signup form

Google changes layouts often, so use this rule:

- Use taps to place the cursor in the correct field.
- Use `adb shell input text` for ASCII-safe values.
- Prefer manual entry for non-ASCII text such as Korean names.
- After each screen, verify visually before continuing.

Example sequence for ASCII fields:

```bash
adb shell input text "Hyunwoo"
adb shell input keyevent KEYCODE_TAB
adb shell input text "Jung"
```

For the birthday step, it is usually faster to tap the month dropdown manually and then input day and year:

```bash
adb shell input text "15"
adb shell input keyevent KEYCODE_TAB
adb shell input text "2000"
```

For username and password:

```bash
adb shell input text "qws94302"
adb shell input keyevent KEYCODE_TAB
adb shell input text "bingogo1"
adb shell input keyevent KEYCODE_TAB
adb shell input text "bingogo1"
```

Practical advice:

- `adb shell input text` is most reliable for letters and digits.
- Spaces must be escaped or replaced depending on device behavior. For names with spaces, use `Firstname%sLastname` style only if the device accepts it; otherwise type manually on-screen.
- If `KEYCODE_TAB` is inconsistent in Chrome, switch to coordinate taps.
- If the keyboard covers the Next button, use `adb shell input keyevent KEYCODE_BACK` once to hide it.

### 5. Move through the flow with taps

Google screens vary by device resolution, language, and Chrome version, so capture coordinates for your device once and reuse them.

Use this method:

1. Take a screenshot
2. Inspect the image on the host
3. Record the tap coordinates for the active device
4. Reuse those coordinates for the same phone model and orientation

Example screenshot command:

```bash
adb shell screencap -p /sdcard/signup-step.png
adb pull /sdcard/signup-step.png ./signup-step.png
```

Then tap a known coordinate:

```bash
adb shell input tap 540 2140
```

Typical places to record:

- First name field
- Last name field
- Next button on each page
- Month dropdown
- Day field
- Year field
- Username field
- Password field
- Confirm password field
- Phone number field
- SMS code field
- Final `I agree` / `동의` button

### 6. Handle phone verification with 5sim

This is the most important part. The existing repo patterns in `account/create-accounts.mjs` and `account/verify-age.mjs` are the right operational model:

- Prefer the verification step when the page body shows `전화번호 인증` or equivalent phone-verification text.
- Buy one number at a time.
- If the number is rejected, cancel it and buy another.
- If SMS never arrives, cancel it.
- Only finish the number after Google accepts the code.

Recommended manual 5sim lifecycle:

1. Buy a Google activation number for the chosen region/operator.
2. Enter the number into the phone field.
3. Submit and wait for the code.
4. Poll 5sim for the SMS.
5. Enter the code into the verification field.
6. Finish the order only after Google accepts it.
7. Cancel the order immediately if the number is rejected or never receives SMS.

A simple host-side polling example with `curl`:

```bash
export FIVESIM_API_KEY='YOUR_KEY'
export ORDER_ID='123456789'

curl -H "Authorization: Bearer $FIVESIM_API_KEY"   -H "Accept: application/json"   "https://5sim.net/v1/user/check/$ORDER_ID"
```

Finish a successful order:

```bash
curl -H "Authorization: Bearer $FIVESIM_API_KEY"   -H "Accept: application/json"   "https://5sim.net/v1/user/finish/$ORDER_ID"
```

Cancel a failed order:

```bash
curl -H "Authorization: Bearer $FIVESIM_API_KEY"   -H "Accept: application/json"   "https://5sim.net/v1/user/cancel/$ORDER_ID"
```

Phone entry tips:

- Many Google flows accept the number better without the country prefix if the country is already selected by UI logic.
- The repo's phone normalization strips the country code before typing in several flows.
- If the phone field is missing entirely, treat that as a flow change or device-side block and capture screenshots before retrying.
- If the number is rejected immediately, do not keep forcing the same number. Cancel and buy a new one.

SMS code entry tips:

- After the SMS arrives, tap the code field and type only the digits.
- If the page auto-submits after the last digit, wait before tapping again.
- If the code fails once, verify that the correct order ID and code were used before buying a new number.

### 7. Complete the signup

After phone verification, Google may show more steps:

- Recovery email prompt
- Privacy or personalization choices
- Terms of service / `I agree` / `동의`
- Skip buttons for optional setup

Recommended rule:

- Continue through required steps only.
- Skip optional recovery-email prompts unless the flow requires it.
- Take a screenshot before the last confirmation and another after the account lands on a signed-in Google page.

A practical success signal is one of these states:

- Chrome lands on Gmail, Google Account, or another signed-in Google property
- Account avatar is visible
- Signup flow no longer returns to phone verification

## ADB Commands Reference

### Launch Chrome

```bash
adb shell am start -n com.android.chrome/com.google.android.apps.chrome.Main
```

### Open a URL in Chrome

```bash
adb shell am start -a android.intent.action.VIEW -d "https://accounts.google.com/signup"
```

### Input text

```bash
adb shell input text "Hyunwoo"
adb shell input text "qws94302"
adb shell input text "bingogo1"
```

### Tap coordinates

```bash
adb shell input tap x y
adb shell input tap 540 2140
```

### Swipe

```bash
adb shell input swipe 500 1800 500 400
```

### Hide keyboard / go back

```bash
adb shell input keyevent KEYCODE_BACK
```

### Press Enter

```bash
adb shell input keyevent KEYCODE_ENTER
```

### Take screenshot on device

```bash
adb shell screencap -p /sdcard/screen.png
```

### Pull screenshot to host

```bash
adb pull /sdcard/screen.png ./screen.png
```

### Dump current UI hierarchy

```bash
adb shell uiautomator dump /sdcard/window_dump.xml
adb pull /sdcard/window_dump.xml ./window_dump.xml
```

This is useful when a field exists on screen but is hard to identify visually.

### Get device resolution

```bash
adb shell wm size
```

### Force-stop Chrome

```bash
adb shell am force-stop com.android.chrome
```

## Suggested Working Loop

Use this loop for each account:

1. Read the target row from `accounts.csv`
2. Connect and verify the device with `adb devices`
3. Launch Chrome and open signup
4. Enter profile data
5. Enter username and password
6. Handle phone verification with 5sim
7. Complete the final consent screens
8. Confirm the account is signed in
9. Save screenshots for evidence
10. Update `accounts.csv` with `created:adb`

## Recording Results in accounts.csv

The CSV header is:

```text
username,email,password,firstName,lastName,koreanName,cost,status,timestamp
```

For ADB-created accounts, write the status as:

```text
created:adb
```

Example successful rows already in the file:

```csv
qws94302,qws94302@gmail.com,bingogo1,Hyunwoo,Jung,정현우,0.0000,created:adb,2026-03-15T00:00:00.000Z
qws94303,qws94303@gmail.com,bingogo1,Hyunwoo,Jung,정현우,0.0000,created:adb,2026-03-15T00:00:00.000Z
qws94304,qws94304@gmail.com,bingogo1,Hyunwoo,Jung,정현우,0.0000,created:adb,2026-03-15T00:00:00.000Z
```

If you are updating an existing failed row, keep the same account identity and append a new row rather than editing history in place. That matches the existing repo pattern where retries and alternate outcomes are stored as additional rows.

Recommended append format:

```csv
qws94305,qws94305@gmail.com,bingogo1,Hyunwoo,Jung,정현우,0.0000,created:adb,2026-03-18T12:34:56.000Z
```

Generate the timestamp on the host with:

```bash
date -u +"%Y-%m-%dT%H:%M:%S.000Z"
```

Append safely from the host:

```bash
printf '%s
' 'qws94305,qws94305@gmail.com,bingogo1,Hyunwoo,Jung,정현우,0.0000,created:adb,2026-03-18T12:34:56.000Z' >> /home/jclee/dev/gmail/accounts.csv
```

## Troubleshooting

### Device not listed in ADB

- Reconnect the USB cable
- Accept the USB debugging trust prompt on the device
- Switch USB mode away from charge-only if needed
- Run `adb kill-server && adb start-server`

### Chrome opens but signup layout looks wrong

- Clear Chrome popups and first-run prompts
- Force-stop Chrome and relaunch
- Verify the URL is really `https://accounts.google.com/signup`
- Keep the device in portrait mode for stable coordinates

### Text input goes to the wrong field

- Tap the field again before typing
- Hide the keyboard and retap
- Use `uiautomator dump` to verify the active screen
- Slow down and verify each field before pressing Next

### Number rejected by Google

- Cancel the 5sim order immediately
- Buy a new number instead of retrying the rejected one
- Check whether Google changed the country or format expectation on that screen

### SMS never arrives

- Poll the order for a reasonable timeout window
- Cancel and rotate to a new number if the message does not arrive
- Keep screenshots of the phone-verification screen and order details for debugging

### Flow lands on QR or extra verification anyway

- Capture screenshots and UI dump
- Treat it as a blocked run for that account/device combination
- Do not mark the row `created:adb` until the account is fully usable

## Practical Notes for This Repo

- The desktop automation already showed repeated `qr_code_verification` blocks for `qws94302` to `qws94304`, then later successful `created:adb` rows for those same usernames.
- That makes Android Chrome via ADB the known-good fallback path for these blocked accounts.
- The existing automation utilities worth mirroring operationally are `STEALTH_ARGS`, `humanType`, `randomInt`, `getBodyText`, and the strict 5sim buy/check/finish/cancel lifecycle in `account/create-accounts.mjs` and `account/verify-age.mjs`.
- For phone-verification detection, keep prioritizing the Korean marker `전화번호 인증` because the repo already uses Korean-first selectors in verification flows.
