const Srf = require('drachtio-srf');
const srf = new Srf();

// Connect to Drachtio server (must match drachtio.conf.xml admin: host, port, secret)
srf.connect({ host: '127.0.0.1', port: 9022, secret: 'cymru' });

srf.on('connect', (err, hostport) => {
  if (err) {
    console.error('Failed to connect to SIP engine:', err);
    return;
  }
  console.log(`Connected to SIP engine at ${hostport}`);
});

// On incoming INVITE: answer and hang up after 5 seconds
srf.invite((req, res) => {
  console.log(`Incoming call from: ${req.get('From')}`);

  srf
    .createUasDialog(req, res, {
      localSdp: req.body,
    })
    .then((dialog) => {
      console.log('Call answered!');
      setTimeout(() => {
        dialog.destroy();
        console.log('Call ended.');
      }, 5000);
    })
    .catch((err) => {
      console.error('Error handling call:', err);
    });
});
