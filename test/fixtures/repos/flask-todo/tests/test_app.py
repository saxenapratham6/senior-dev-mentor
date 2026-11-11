from app import app


def test_index_loads():
    client = app.test_client()
    assert client.get("/").status_code == 200
