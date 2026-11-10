AppSettingsPage({
  build() {
    return View(
      {
        style: {
          width: "100%",
          padding: "16px 14px",
          background: "#09090b",
          boxSizing: "border-box",
        },
      },
      [
        // Header
        View(
          {
            style: {
              width: "100%",
              marginBottom: "16px",
              padding: "4px 2px",
            },
          },
          [
            Text({
              text: "T3 Zepp",
              style: {
                color: "#ffffff",
                fontSize: "20px",
                fontWeight: "700",
                letterSpacing: "-0.3px",
                marginBottom: "4px",
              },
            }),
            Text({
              text: "A community-built companion for T3 Code on Amazfit watches. Current support includes T-Rex 3, with room to grow into more watch-first experiences over time.",
              style: {
                color: "#a1a1aa",
                fontSize: "13px",
              },
            }),
          ],
        ),

        // Pairing Card
        View(
          {
            style: {
              width: "100%",
              background: "#141417",
              border: "1px solid #27272a",
              borderRadius: "12px",
              padding: "16px",
              marginBottom: "16px",
              boxSizing: "border-box",
            },
          },
          [
            Text({
              text: "Device Pairing",
              style: {
                color: "#f4f4f5",
                fontSize: "15px",
                fontWeight: "600",
                marginBottom: "4px",
              },
            }),
            Text({
              text: "Enter your 6-digit pairing code or persistent Device Key from the web dashboard.",
              style: {
                color: "#a1a1aa",
                fontSize: "12px",
                lineHeight: "18px",
                marginBottom: "14px",
              },
            }),
            View(
              {
                style: {
                  width: "100%",
                  marginBottom: "14px",
                },
              },
              [
                TextInput({
                  label: "Pairing Code or Device Key",
                  placeholder: "e.g. 120323 or tz_live_...",
                  settingsKey: "deviceKey",
                  multiline: true,
                  rows: 2,
                  style: {
                    width: "100%",
                    minHeight: "60px",
                    boxSizing: "border-box",
                  },
                  inputStyle: {
                    width: "100%",
                    minHeight: "60px",
                    boxSizing: "border-box",
                    background: "#0d0d11",
                    color: "#ffffff",
                    borderRadius: "8px",
                    border: "1px solid #27272a",
                    padding: "8px 12px",
                    fontSize: "13px",
                  },
                  labelStyle: {
                    color: "#f4f4f5",
                    fontSize: "13px",
                    fontWeight: "600",
                    marginBottom: "6px",
                  },
                  subStyle: { color: "#71717a", fontSize: "11px" },
                }),
              ],
            ),
            Link(
              {
                source: "https://t3zepp.devarshi.dev/pair",
              },
              [
                View(
                  {
                    style: {
                      background: "#f4f4f5",
                      borderRadius: "8px",
                      padding: "12px 16px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      boxSizing: "border-box",
                      width: "100%",
                      textAlign: "center",
                      cursor: "pointer",
                    },
                  },
                  [
                    Text(
                      {
                        style: {
                          color: "#09090b",
                          fontSize: "13px",
                          fontWeight: "600",
                          textAlign: "center",
                        },
                      },
                      "Open Pairing Dashboard (Web)",
                    ),
                  ],
                ),
              ],
            ),
            View(
              {
                style: {
                  width: "100%",
                  marginTop: "10px",
                  textAlign: "center",
                },
              },
              [
                Link(
                  {
                    source: "https://t3zepp.devarshi.dev/pair",
                  },
                  [
                    Text(
                      {
                        style: {
                          color: "#38bdf8",
                          fontSize: "12px",
                          textAlign: "center",
                          textDecoration: "underline",
                        },
                      },
                      "https://t3zepp.devarshi.dev/pair",
                    ),
                  ],
                ),
              ],
            ),
          ],
        ),

        // About & Repo Card
        View(
          {
            style: {
              width: "100%",
              background: "#141417",
              border: "1px solid #27272a",
              borderRadius: "12px",
              padding: "16px",
              marginBottom: "16px",
              boxSizing: "border-box",
            },
          },
          [
            Text({
              text: "About",
              style: {
                color: "#f4f4f5",
                fontSize: "14px",
                fontWeight: "600",
                marginBottom: "4px",
              },
            }),
            Text({
              text: "Independent community companion for T3 Code on Zepp OS 4.0. AGPL-3.0 licensed.",
              style: {
                color: "#71717a",
                fontSize: "12px",
                lineHeight: "17px",
                marginBottom: "12px",
              },
            }),
            Link(
              {
                source: "https://github.com/devarshishimpi/t3zepp",
              },
              [
                View(
                  {
                    style: {
                      background: "#27272a",
                      borderRadius: "8px",
                      padding: "10px 16px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      boxSizing: "border-box",
                      width: "100%",
                      textAlign: "center",
                      cursor: "pointer",
                    },
                  },
                  [
                    Text(
                      {
                        style: {
                          color: "#f4f4f5",
                          fontSize: "12px",
                          fontWeight: "500",
                          textAlign: "center",
                        },
                      },
                      "GitHub: devarshishimpi/t3zepp",
                    ),
                  ],
                ),
              ],
            ),
          ],
        ),
      ],
    );
  },
});
