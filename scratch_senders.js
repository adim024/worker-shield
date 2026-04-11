async function getSenders() {
    const resp = await fetch('https://api.zavu.dev/v1/senders', {
        headers: {
            'Authorization': `Bearer zv_live_be9c9e75a226f2dfac2c390cccd122130fe72e8eb052272e`
        }
    });
    console.log(await resp.text());
}
getSenders();
