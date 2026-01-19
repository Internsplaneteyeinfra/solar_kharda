import ee
import json

CRED_PATH = 'credentials.json'

creds = json.load(open(CRED_PATH))
auth = ee.ServiceAccountCredentials(creds['client_email'], key_data=json.dumps(creds))
ee.Initialize(auth, project=creds['project_id'])

print("GEE OK")
