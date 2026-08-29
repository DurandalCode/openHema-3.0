package filestore

import "testing"

func TestSniff(t *testing.T) {
	cases := []struct {
		name   string
		head   []byte
		want   string
		wantOK bool
	}{
		{
			name:   "pdf",
			head:   append([]byte("%PDF-1.7\n%\xE2\xE3\xCF\xD3"), []byte("...rest of file...")...),
			want:   "application/pdf",
			wantOK: true,
		},
		{
			name:   "png",
			head:   append([]byte{0x89, 'P', 'N', 'G', '\r', '\n', 0x1a, '\n'}, []byte{0, 0, 0, 13}...),
			want:   "image/png",
			wantOK: true,
		},
		{
			name:   "jpeg",
			head:   []byte{0xFF, 0xD8, 0xFF, 0xE0, 0, 0x10, 'J', 'F', 'I', 'F'},
			want:   "image/jpeg",
			wantOK: true,
		},
		{
			name: "webp",
			head: append(
				append([]byte("RIFF"), []byte{0x24, 0x00, 0x00, 0x00}...),
				[]byte("WEBPVP8 ")...,
			),
			want:   "image/webp",
			wantOK: true,
		},
		{
			name:   "svg text is rejected",
			head:   []byte(`<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>`),
			want:   "",
			wantOK: false,
		},
		{
			name:   "plain text is rejected",
			head:   []byte("just some regular text content, not a known format"),
			want:   "",
			wantOK: false,
		},
		{
			name:   "empty slice does not panic",
			head:   []byte{},
			want:   "",
			wantOK: false,
		},
		{
			name:   "nil slice does not panic",
			head:   nil,
			want:   "",
			wantOK: false,
		},
		{
			name:   "short slice does not panic",
			head:   []byte{0x89, 'P'},
			want:   "",
			wantOK: false,
		},
		{
			name:   "riff without webp is rejected",
			head:   []byte("RIFF\x00\x00\x00\x00WAVEfmt "),
			want:   "",
			wantOK: false,
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			mime, ok := Sniff(tc.head)
			if ok != tc.wantOK {
				t.Fatalf("Sniff(%q) ok = %v, want %v", tc.head, ok, tc.wantOK)
			}
			if mime != tc.want {
				t.Errorf("Sniff(%q) mime = %q, want %q", tc.head, mime, tc.want)
			}
		})
	}
}
