// const fetch = require('node-fetch'); // we use global fetch

async function testFetch() {
    const phoneNumber = '+919999999999';
    const otp = '1234';
    
    // Using fetch directly
    const resp = await fetch('https://api.zavu.dev/v1/messages', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer zv_live_be9c9e75a226f2dfac2c390cccd122130fe72e8eb052272e`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            to: phoneNumber,
            text: `*GigShield:* Your login OTP is ${otp}. Do not share this code.`,
            channel: 'whatsapp'
        })
    });
    
    console.log(resp.status);
    console.log(await resp.text());
}

testFetch();
