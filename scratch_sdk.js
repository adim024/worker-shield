const Zavudev = require('@zavudev/sdk');
const client = new Zavudev({ apiKey: 'zv_live_be9c9e75a226f2dfac2c390cccd122130fe72e8eb052272e' });

async function testSDK() {
    try {
        const resp = await client.messages.send({
            to: '+919999999999',
            text: 'Your login OTP is 1234. Do not share this code.',
            channel: 'whatsapp',
            fallbackEnabled: true
        });
        console.log("Success:", JSON.stringify(resp, null, 2));
    } catch (e) {
        console.error("Error:", e);
    }
}
testSDK();
