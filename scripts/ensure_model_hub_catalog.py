"""Ensure movies_catalog.json is uploaded to Hugging Face Model Hub with proper array genres."""

import json
import os
import sys
import urllib.request

try:
    from huggingface_hub import HfApi
    import pyarrow.parquet as pq
except ImportError as e:
    print(f"Missing dependencies: {e}", file=sys.stderr)
    sys.exit(0)


def main():
    token = os.environ.get("HF_TOKEN")
    if not token:
        print("HF_TOKEN not set, skipping model hub catalog check.")
        return

    api = HfApi(token=token)
    model_repo = "pavanbadempet/movie-recs-models"
    print(f"Checking if movies_catalog.json exists in {model_repo}...")

    try:
        files = api.list_repo_files(model_repo)
        need_upload = False
        if "movies_catalog.json" not in files:
            print("movies_catalog.json not found in model hub.")
            need_upload = True
        else:
            try:
                test_url = f"https://huggingface.co/{model_repo}/resolve/main/movies_catalog.json"
                req = urllib.request.urlopen(test_url)
                sample = req.read(2000).decode("utf-8", errors="ignore")
                # If genres was saved as a comma-separated string, re-upload as proper list
                if '"genres":"' in sample:
                    print("Existing catalog has string genres, re-generating with list genres...")
                    need_upload = True
            except Exception as e:
                print(f"Could not inspect existing catalog: {e}")

        if need_upload:
            print("Downloading movies_transformed.parquet to extract movies_catalog.json...")
            parquet_url = f"https://huggingface.co/{model_repo}/resolve/main/movies_transformed.parquet"
            urllib.request.urlretrieve(parquet_url, "movies_temp.parquet")
            cols = [
                "id",
                "title",
                "overview",
                "genres",
                "vote_average",
                "vote_count",
                "popularity",
                "release_date",
                "poster_path",
            ]
            t = pq.read_table("movies_temp.parquet", columns=cols)
            pyd = t.to_pylist()
            for row in pyd:
                g = row.get("genres")
                if isinstance(g, str):
                    row["genres"] = [x.strip() for x in g.split(",") if x.strip()]
                elif not isinstance(g, list):
                    row["genres"] = []

            with open("movies_catalog.json", "w", encoding="utf-8") as f:
                json.dump(pyd, f, separators=(",", ":"))

            size_mb = os.path.getsize("movies_catalog.json") / (1024 * 1024)
            print(f"Uploading movies_catalog.json ({size_mb:.2f} MB) to {model_repo}...")
            api.upload_file(
                path_or_fileobj="movies_catalog.json",
                path_in_repo="movies_catalog.json",
                repo_id=model_repo,
                repo_type="model",
            )
            print("movies_catalog.json published successfully to Model Hub!")
        else:
            print("movies_catalog.json is already up to date in Model Hub.")
    except Exception as e:
        print(f"Warning while ensuring catalog in hub: {e}", file=sys.stderr)
    finally:
        if os.path.exists("movies_temp.parquet"):
            os.remove("movies_temp.parquet")
        if os.path.exists("movies_catalog.json"):
            os.remove("movies_catalog.json")


if __name__ == "__main__":
    main()
