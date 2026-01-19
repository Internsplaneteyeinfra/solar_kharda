import os
import json
import ee

def init_gee():
    """
    Initialize Google Earth Engine once at app startup
    Shared by Kharda + Solar backends
    """
    try:
        base_dir = os.path.dirname(
            os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        )
        credentials_path = os.path.join(base_dir, "credentials.json")

        credentials = None
        project_id = None

        if os.path.exists(credentials_path):
            print(f"Loading GEE credentials from {credentials_path}")

            with open(credentials_path, "r") as f:
                creds_dict = json.load(f)

            project_id = creds_dict.get("project_id")

            credentials = ee.ServiceAccountCredentials(
                creds_dict["client_email"],
                key_data=json.dumps(creds_dict)   # ✅ FULL JSON
            )

        elif os.getenv("GEE_CLIENT_EMAIL") and os.getenv("GEE_PRIVATE_KEY"):
            print("Loading GEE credentials from environment variables")

            credentials = ee.ServiceAccountCredentials(
                os.getenv("GEE_CLIENT_EMAIL"),
                key_data=os.getenv("GEE_PRIVATE_KEY").replace("\\n", "\n")
            )
            project_id = os.getenv("GEE_PROJECT_ID")

        else:
            print("❌ No GEE credentials found")
            return

        if project_id:
            ee.Initialize(credentials, project=project_id)
            print(f"✅ Earth Engine initialized (project: {project_id})")
        else:
            ee.Initialize(credentials)
            print("✅ Earth Engine initialized (no project id)")

        # ✅ SAFE TEST (AFTER INIT)
        ee.Image("NASA/NASADEM_HGT").getInfo()
        print("✅ GEE dataset access verified")

    except Exception as e:
        print(f"❌ Error initializing Earth Engine: {e}")
