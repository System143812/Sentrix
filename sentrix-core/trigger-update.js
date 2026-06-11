import https from 'https';

const token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6Ijk5Y2RmZmM2LTQ5YTUtMTFmMS05MzQ0LWI0YjUyZjgyZDgyNSIsImVtYWlsIjoiYWRtaW5AZXhhbXBsZS5jb20iLCJyb2xlIjoibmV0d29ya19hZG1pbiIsImlhdCI6MTc4MTE3MTk0MywiZXhwIjoxNzgxMjAwNzQzfQ.pLj2-93ssqWQnUgsnmtMsdvjD568T-e9ARW276wMP2M";

const data = JSON.stringify({
  ip: "192.168.1.200",
  credentials: {
    username: "Administrator",
    password: "SentrixLab2024!"
  },
  action: "update"
});

const options = {
  hostname: 'localhost',
  port: 4000,
  path: `/api/discovery/deploy`,
  method: 'POST',
  rejectUnauthorized: false,
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': data.length,
    'Authorization': `Bearer ${token}`,
    'X-Requested-With': 'XMLHttpRequest'
  }
};

console.log(`Sending POST request to https://localhost:4000/api/discovery/deploy...`);

const req = https.request(options, (res) => {
  console.log(`STATUS CODE: ${res.statusCode}`);
  let responseData = '';

  res.on('data', (chunk) => {
    responseData += chunk;
  });

  res.on('end', () => {
    console.log('RESPONSE BODY:');
    try {
      console.log(JSON.stringify(JSON.parse(responseData), null, 2));
    } catch {
      console.log(responseData);
    }
  });
});

req.on('error', (e) => {
  console.error(`Request Error: ${e.message}`);
});

req.write(data);
req.end();
