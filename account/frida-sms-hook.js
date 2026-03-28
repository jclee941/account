/**
 * Frida SMS Interception Script
 * Hooks ALL SMS-related methods to capture outgoing SMS from Google device phone verification.
 * 
 * Target: com.android.phone process (telephony) + com.google.android.gms (Play Services)
 * 
 * Usage: frida -D emulator-5554 -p <pid> -l frida-sms-hook.js
 * Or spawn: frida -D emulator-5554 -f com.android.phone -l frida-sms-hook.js --no-pause
 */

'use strict';

const CAPTURED_DATA = [];
const LOG_PREFIX = '[SMS-HOOK]';

function log(msg) {
  console.log(`${LOG_PREFIX} ${msg}`);
}

function logCapture(method, dest, body, extra) {
  const entry = {
    timestamp: new Date().toISOString(),
    method: method,
    destination: dest,
    body: body,
    extra: extra || {}
  };
  CAPTURED_DATA.push(entry);
  log(`🎯 CAPTURED SMS!`);
  log(`  Method: ${method}`);
  log(`  Destination: ${dest}`);
  log(`  Body: ${body}`);
  if (extra) log(`  Extra: ${JSON.stringify(extra)}`);
  
  // Also write to a file on the device for external retrieval
  try {
    const File = Java.use('java.io.File');
    const FileWriter = Java.use('java.io.FileWriter');
    const f = FileWriter.$new('/data/local/tmp/sms_capture.json', true);
    f.write(JSON.stringify(entry) + '\n');
    f.close();
    log(`  Written to /data/local/tmp/sms_capture.json`);
  } catch (e) {
    log(`  File write failed: ${e.message}`);
  }
}

Java.perform(function () {
  log('=== Frida SMS Hook Script Started ===');
  log(`Process: ${Process.id} (${Java.use('android.app.ActivityThread').currentProcessName()})`);

  // ═══════════════════════════════════════════════════════
  // Hook 1: SmsManager.sendTextMessage (most common)
  // ═══════════════════════════════════════════════════════
  try {
    const SmsManager = Java.use('android.telephony.SmsManager');
    
    // sendTextMessage(String destinationAddress, String scAddress, String text, PendingIntent sentIntent, PendingIntent deliveryIntent)
    SmsManager.sendTextMessage.overload('java.lang.String', 'java.lang.String', 'java.lang.String', 'android.app.PendingIntent', 'android.app.PendingIntent').implementation = function (dest, sc, text, sentPI, delivPI) {
      logCapture('SmsManager.sendTextMessage', dest, text, { scAddress: sc ? sc.toString() : null });
      return this.sendTextMessage(dest, sc, text, sentPI, delivPI);
    };
    log('✅ Hooked SmsManager.sendTextMessage(5-arg)');
  } catch (e) {
    log(`⚠️ SmsManager.sendTextMessage(5-arg): ${e.message}`);
  }

  // sendTextMessage with subscriptionId (Android 5.1+)
  try {
    const SmsManager = Java.use('android.telephony.SmsManager');
    SmsManager.sendTextMessage.overload('java.lang.String', 'java.lang.String', 'java.lang.String', 'android.app.PendingIntent', 'android.app.PendingIntent', 'int').implementation = function (dest, sc, text, sentPI, delivPI, priority) {
      logCapture('SmsManager.sendTextMessage(6-arg)', dest, text, { scAddress: sc ? sc.toString() : null, priority: priority });
      return this.sendTextMessage(dest, sc, text, sentPI, delivPI, priority);
    };
    log('✅ Hooked SmsManager.sendTextMessage(6-arg)');
  } catch (e) {
    log(`⚠️ SmsManager.sendTextMessage(6-arg): ${e.message}`);
  }

  // sendTextMessage with subscriptionId + boolean
  try {
    const SmsManager = Java.use('android.telephony.SmsManager');
    SmsManager.sendTextMessage.overload('java.lang.String', 'java.lang.String', 'java.lang.String', 'android.app.PendingIntent', 'android.app.PendingIntent', 'long').implementation = function (dest, sc, text, sentPI, delivPI, messageId) {
      logCapture('SmsManager.sendTextMessage(long)', dest, text, { scAddress: sc ? sc.toString() : null, messageId: messageId });
      return this.sendTextMessage(dest, sc, text, sentPI, delivPI, messageId);
    };
    log('✅ Hooked SmsManager.sendTextMessage(long-arg)');
  } catch (e) {
    log(`⚠️ SmsManager.sendTextMessage(long-arg): ${e.message}`);
  }

  // ═══════════════════════════════════════════════════════
  // Hook 2: SmsManager.sendMultipartTextMessage
  // ═══════════════════════════════════════════════════════
  try {
    const SmsManager = Java.use('android.telephony.SmsManager');
    SmsManager.sendMultipartTextMessage.overload('java.lang.String', 'java.lang.String', 'java.util.ArrayList', 'java.util.ArrayList', 'java.util.ArrayList').implementation = function (dest, sc, parts, sentIntents, delivIntents) {
      const partsList = [];
      for (let i = 0; i < parts.size(); i++) {
        partsList.push(parts.get(i).toString());
      }
      logCapture('SmsManager.sendMultipartTextMessage', dest, partsList.join(''), { parts: partsList });
      return this.sendMultipartTextMessage(dest, sc, parts, sentIntents, delivIntents);
    };
    log('✅ Hooked SmsManager.sendMultipartTextMessage');
  } catch (e) {
    log(`⚠️ SmsManager.sendMultipartTextMessage: ${e.message}`);
  }

  // ═══════════════════════════════════════════════════════
  // Hook 3: SmsManager.sendDataMessage  
  // ═══════════════════════════════════════════════════════
  try {
    const SmsManager = Java.use('android.telephony.SmsManager');
    SmsManager.sendDataMessage.overload('java.lang.String', 'java.lang.String', 'short', '[B', 'android.app.PendingIntent', 'android.app.PendingIntent').implementation = function (dest, sc, port, data, sentPI, delivPI) {
      const dataStr = data ? Java.array('byte', data).map(b => String.fromCharCode(b & 0xFF)).join('') : 'null';
      logCapture('SmsManager.sendDataMessage', dest, `[binary:${data ? data.length : 0}B]`, { port: port, dataHex: data ? Array.from(Java.array('byte', data)).map(b => ('0' + (b & 0xFF).toString(16)).slice(-2)).join('') : '' });
      return this.sendDataMessage(dest, sc, port, data, sentPI, delivPI);
    };
    log('✅ Hooked SmsManager.sendDataMessage');
  } catch (e) {
    log(`⚠️ SmsManager.sendDataMessage: ${e.message}`);
  }

  // ═══════════════════════════════════════════════════════
  // Hook 4: IccSmsInterfaceManager / ISms (AIDL level)
  // ═══════════════════════════════════════════════════════
  try {
    const ISms = Java.use('com.android.internal.telephony.ISms$Stub$Proxy');
    
    // List all send-related methods first
    const methods = ISms.class.getDeclaredMethods();
    log(`ISms$Stub$Proxy has ${methods.length} methods`);
    methods.forEach(function (method) {
      const name = method.getName();
      if (name.toLowerCase().includes('send') || name.toLowerCase().includes('sms')) {
        log(`  Found ISms method: ${name}(${method.getParameterTypes().map(p => p.getName()).join(', ')})`);
      }
    });
    
    // Hook sendTextForSubscriber — THE key method GMS uses
    try {
      ISms.sendTextForSubscriber.implementation = function () {
        const args = Array.from(arguments);
        const subId = args[0];
        const pkg = args[1] ? args[1].toString() : 'null';
        const dest = args[2] ? args[2].toString() : 'null';
        const sc = args[3] ? args[3].toString() : 'null';
        const text = args[4] ? args[4].toString() : 'null';
        logCapture('ISms.sendTextForSubscriber', dest, text, {
          subId: subId, callingPkg: pkg, scAddress: sc,
          argCount: args.length
        });
        return this.sendTextForSubscriber.apply(this, args);
      };
      log('✅ Hooked ISms.sendTextForSubscriber');
    } catch (e2) {
      log(`⚠️ ISms.sendTextForSubscriber hook: ${e2.message}`);
    }
    
    // Also try sendText (older signature)
    try {
      ISms.sendText.implementation = function () {
        const args = Array.from(arguments);
        const pkg = args[0] ? args[0].toString() : 'null';
        const dest = args[1] ? args[1].toString() : 'null';
        const text = args[3] ? args[3].toString() : 'null';
        logCapture('ISms.sendText', dest, text, { callingPkg: pkg, argCount: args.length });
        return this.sendText.apply(this, args);
      };
      log('✅ Hooked ISms.sendText');
    } catch (e3) {
      log(`⚠️ ISms.sendText: ${e3.message}`);
    }
  } catch (e) {
    log(`⚠️ ISms$Stub$Proxy: ${e.message}`);
  }

  // ═══════════════════════════════════════════════════════
  // Hook 5: SMSDispatcher.sendText (internal telephony)
  // ═══════════════════════════════════════════════════════
  try {
    const clazz = Java.use('com.android.internal.telephony.SMSDispatcher');
    const methods = clazz.class.getDeclaredMethods();
    methods.forEach(function (method) {
      const name = method.getName();
      if (name.toLowerCase().includes('send')) {
        log(`  Found SMSDispatcher method: ${name}`);
      }
    });
  } catch (e) {
    log(`⚠️ SMSDispatcher: ${e.message}`);
  }

  // ═══════════════════════════════════════════════════════
  // Hook 6: GsmSMSDispatcher / ImsSMSDispatcher
  // ═══════════════════════════════════════════════════════
  const dispatcherClasses = [
    'com.android.internal.telephony.gsm.GsmSMSDispatcher',
    'com.android.internal.telephony.ImsSMSDispatcher',
    'com.android.internal.telephony.cdma.CdmaSMSDispatcher'
  ];
  
  dispatcherClasses.forEach(function (className) {
    try {
      const clazz = Java.use(className);
      const methods = clazz.class.getDeclaredMethods();
      methods.forEach(function (method) {
        const name = method.getName();
        if (name.toLowerCase().includes('send') && name.toLowerCase().includes('sms')) {
          log(`  Found ${className.split('.').pop()}.${name}`);
        }
      });
    } catch (e) {
      // Class might not exist on this Android version
    }
  });

  // ═══════════════════════════════════════════════════════
  // Hook 7: RIL layer - CommandsInterface.sendSMS
  // ═══════════════════════════════════════════════════════
  try {
    const RIL = Java.use('com.android.internal.telephony.RIL');
    
    // sendSMS(String smscPdu, String pdu, Message result)
    RIL.sendSMS.overload('java.lang.String', 'java.lang.String', 'android.os.Message').implementation = function (smscPdu, pdu, result) {
      logCapture('RIL.sendSMS', 'RIL-level', `smscPdu=${smscPdu}`, { pdu: pdu });
      
      // Decode PDU to extract destination and message
      try {
        if (pdu) {
          log(`  PDU: ${pdu}`);
          // PDU format: SMSC + first octet + MR + DA + PID + DCS + VP + UDL + UD
          // DA starts at different offsets depending on SMSC length
        }
      } catch (e) {
        log(`  PDU decode error: ${e.message}`);
      }
      
      return this.sendSMS(smscPdu, pdu, result);
    };
    log('✅ Hooked RIL.sendSMS');
  } catch (e) {
    log(`⚠️ RIL.sendSMS: ${e.message}`);
  }

  // ═══════════════════════════════════════════════════════
  // Hook 8: ContentResolver.insert (SMS content provider)
  // ═══════════════════════════════════════════════════════
  try {
    const ContentResolver = Java.use('android.content.ContentResolver');
    ContentResolver.insert.overload('android.net.Uri', 'android.content.ContentValues').implementation = function (uri, values) {
      const uriStr = uri.toString();
      if (uriStr.includes('sms') || uriStr.includes('mms')) {
        const address = values.getAsString('address');
        const body = values.getAsString('body');
        if (address || body) {
          logCapture('ContentResolver.insert(sms)', address || 'unknown', body || 'unknown', { uri: uriStr });
        }
      }
      return this.insert(uri, values);
    };
    log('✅ Hooked ContentResolver.insert (SMS provider)');
  } catch (e) {
    log(`⚠️ ContentResolver.insert: ${e.message}`);
  }

  // ═══════════════════════════════════════════════════════
  // Hook 8.5: startActivity — capture FULL SMS Intents with extras
  // This is KEY: Chrome fires Intent(SENDTO, smsto:PHONE?body=CODE)
  // The constructor hook only sees empty URI; startActivity has final data
  // ═══════════════════════════════════════════════════════
  function dumpSmsIntent(tag, intent) {
    try {
      var action = intent.getAction();
      var data = intent.getData();
      var dataStr = data ? data.toString() : 'null';
      // Only log SMS-related intents
      if (!action && !dataStr.includes('sms') && !dataStr.includes('tel')) return;
      if (action && !action.includes('SEND') && !action.includes('sms') && !action.includes('SMS') &&
          !action.includes('VIEW') && !action.includes('DIAL')) {
        if (!dataStr.includes('sms') && !dataStr.includes('tel')) return;
      }
      log('🚨🚨🚨 ' + tag);
      log('  action=' + action);
      log('  data=' + dataStr);
      log('  type=' + intent.getType());
      log('  package=' + intent.getPackage());
      // Dump ALL extras
      var bundle = intent.getExtras();
      if (bundle) {
        var keys = bundle.keySet();
        var iter = keys.iterator();
        while (iter.hasNext()) {
          var key = iter.next();
          var val = bundle.get(key);
          log('  extra: ' + key + ' = ' + (val ? val.toString() : 'null'));
        }
      } else {
        log('  extras: null');
      }
      // Extract sms_body specifically
      var smsBody = intent.getStringExtra('sms_body');
      if (smsBody) {
        log('  📧 SMS_BODY: ' + smsBody);
        logCapture('startActivity.SENDTO', dataStr, smsBody, { action: action });
      }
      // Also check for address/body in URI
      if (dataStr.includes('smsto:') || dataStr.includes('sms:')) {
        log('  📞 SMS URI detected: ' + dataStr);
        logCapture('startActivity.SMS_URI', dataStr, smsBody || 'from-uri', { action: action });
      }
    } catch (e) {
      log('  dumpSmsIntent error: ' + e.message);
    }
  }

  // Hook Activity.startActivity
  try {
    var Activity = Java.use('android.app.Activity');
    Activity.startActivity.overload('android.content.Intent').implementation = function (intent) {
      dumpSmsIntent('Activity.startActivity', intent);
      return this.startActivity(intent);
    };
    log('✅ Hooked Activity.startActivity');
  } catch (e) {
    log('⚠️ Activity.startActivity: ' + e.message);
  }

  // Hook ContextWrapper.startActivity (base class used by GMS)
  try {
    var ContextWrapper = Java.use('android.content.ContextWrapper');
    ContextWrapper.startActivity.overload('android.content.Intent').implementation = function (intent) {
      dumpSmsIntent('ContextWrapper.startActivity', intent);
      return this.startActivity(intent);
    };
    log('✅ Hooked ContextWrapper.startActivity');
  } catch (e) {
    log('⚠️ ContextWrapper.startActivity: ' + e.message);
  }

  // Hook Intent.setData to trace URI assignment
  try {
    var Intent = Java.use('android.content.Intent');
    Intent.setData.overload('android.net.Uri').implementation = function (uri) {
      var uriStr = uri ? uri.toString() : 'null';
      if (uriStr.includes('sms') || uriStr.includes('tel') || uriStr.includes('mms')) {
        log('🔔 Intent.setData: ' + uriStr);
      }
      return this.setData(uri);
    };
    log('✅ Hooked Intent.setData');
  } catch (e) {
    log('⚠️ Intent.setData: ' + e.message);
  }

  // Hook Intent.putExtra(String, String) for sms_body etc.
  try {
    var Intent = Java.use('android.content.Intent');
    Intent.putExtra.overload('java.lang.String', 'java.lang.String').implementation = function (key, val) {
      if (key === 'sms_body' || key === 'address' || key === 'sms_to' ||
          key === 'android.intent.extra.TEXT' || key === 'exit_on_sent') {
        log('🔔 Intent.putExtra: ' + key + ' = ' + val);
      }
      return this.putExtra(key, val);
    };
    log('✅ Hooked Intent.putExtra(String, String)');
  } catch (e) {
    log('⚠️ Intent.putExtra: ' + e.message);
  }

  // ═══════════════════════════════════════════════════════
  // Hook 9: Intent monitoring for SMS-related actions
  // ═══════════════════════════════════════════════════════
  try {
    const Intent = Java.use('android.content.Intent');
    Intent.$init.overload('java.lang.String', 'android.net.Uri').implementation = function (action, uri) {
      if (action && (action.includes('SMS') || action.includes('sms') || action.includes('SENDTO') || action.includes('MMS'))) {
        log(`🔔 Intent created: action=${action}, uri=${uri ? uri.toString() : 'null'}`);
      }
      return this.$init(action, uri);
    };
    log('✅ Hooked Intent constructor (SMS actions)');
  } catch (e) {
    log(`⚠️ Intent constructor: ${e.message}`);
  }

  // ═══════════════════════════════════════════════════════
  // Hook 10: SmsMessage.createFromPdu (intercept any SMS construction)
  // ═══════════════════════════════════════════════════════
  try {
    const SmsMessage = Java.use('android.telephony.SmsMessage');
    SmsMessage.createFromPdu.overload('[B', 'java.lang.String').implementation = function (pdu, format) {
      const result = this.createFromPdu(pdu, format);
      if (result) {
        log(`🔔 SmsMessage.createFromPdu: dest=${result.getDestinationAddress()}, body=${result.getMessageBody()}`);
      }
      return result;
    };
    log('✅ Hooked SmsMessage.createFromPdu');
  } catch (e) {
    log(`⚠️ SmsMessage.createFromPdu: ${e.message}`);
  }

  // ═══════════════════════════════════════════════════════
  // Hook 11: PendingIntent monitoring for SMS callbacks
  // ═══════════════════════════════════════════════════════
  try {
    const PendingIntent = Java.use('android.app.PendingIntent');
    PendingIntent.getBroadcast.overload('android.content.Context', 'int', 'android.content.Intent', 'int').implementation = function (ctx, reqCode, intent, flags) {
      const action = intent.getAction();
      if (action && (action.includes('SMS') || action.includes('sms'))) {
        log(`🔔 PendingIntent.getBroadcast: action=${action}, reqCode=${reqCode}`);
      }
      return this.getBroadcast(ctx, reqCode, intent, flags);
    };
    log('✅ Hooked PendingIntent.getBroadcast');
  } catch (e) {
    log(`⚠️ PendingIntent.getBroadcast: ${e.message}`);
  }

  // ═══════════════════════════════════════════════════════
  // Hook 12: TelephonyManager methods
  // ═══════════════════════════════════════════════════════
  try {
    const TelephonyManager = Java.use('android.telephony.TelephonyManager');
    
    TelephonyManager.getLine1Number.overload().implementation = function () {
      const num = this.getLine1Number();
      log(`🔔 TelephonyManager.getLine1Number() → ${num}`);
      return num;
    };
    log('✅ Hooked TelephonyManager.getLine1Number');
  } catch (e) {
    log(`⚠️ TelephonyManager.getLine1Number: ${e.message}`);
  }

  log('=== All hooks installed. Waiting for SMS activity... ===');
  log('=== Clear capture file: adb shell "echo > /data/local/tmp/sms_capture.json" ===');
});
