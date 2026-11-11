package store

import "testing"

func TestAdd(t *testing.T) {
	if New().Add("https://example.com") != "1" {
		t.Fatal("first code should be 1")
	}
}
