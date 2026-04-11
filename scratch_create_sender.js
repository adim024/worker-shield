const Zavudev = require('@zavudev/sdk');
const client = new Zavudev({ apiKey: 'zv_live_be9c9e75a226f2dfac2c390cccd122130fe72e8eb052272e' });

async function deleteSender() {
    try {
        await client.senders.delete('kd71y7gr8vgfdedx5jcq8g8dbn84jkan');
        console.log("Deleted dummy sender");
    } catch(e) {
        console.error("Error:", e);
    }
}
deleteSender();
