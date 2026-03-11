import Srf from 'drachtio-srf';

const srf = new Srf();

// If Drachtio is not running, we get ECONNREFUSED; handle it so the message is clear
srf.on('error', (err: Error) => {
  console.error('SIP engine error:', err.message);
  if (err.message.includes('ECONNREFUSED')) {
    console.error('\n→ Start Drachtio first in another terminal: drachtio -f drachtio.conf.xml');
    console.error('→ If "command not found: drachtio", install it first: see docs/INSTALL-DRACHTIO.md\n');
  }
  process.exit(1);
});

// Connect to Drachtio server (must match drachtio.conf.xml admin: host, port, secret)
srf.connect({ host: '127.0.0.1', port: 9022, secret: 'cymru' });

srf.on('connect', (err: Error, hostport: string) => {
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
    .createUAS(req, res, {
      localSdp: req.sdp,
    })
    .then((dialog) => {
      console.log('Call answered!');
      setTimeout(() => {
        dialog.destroy();
        console.log('Call ended.');
      }, 5000);
    })
    .catch((err: unknown) => {
      console.error('Error handling call:', err);
    });
});
