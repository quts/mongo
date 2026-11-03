export type IconName =
  | "map"
  | "calendar"
  | "coin"
  | "people"
  | "jobs"
  | "menu"
  | "hq"
  | "farm"
  | "house"
  | "pan"
  | "inspect"
  | "center"
  | "close"
  | "help"
  | "grid"
  | "save"
  | "clock"
  | "pause"
  | "play"
  | "check"
  | "restart";
export function Icon({
  name,
  className = "",
}: {
  name: IconName;
  className?: string;
}) {
  const line = {
    stroke: "#594c39",
    strokeWidth: 2.7,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  return (
    <svg
      className={`icon ${className}`}
      viewBox="0 0 64 64"
      fill="none"
      aria-hidden="true"
    >
      <g {...line}>
        {name === "farm" && (
          <>
            <path d="M5 35 29 19 59 32 35 51Z" fill="#b9d877" />
            <path d="m5 35 30 16v6L5 41Zm30 16 24-19v7L35 57Z" fill="#96b65c" />
            <path d="m13 35 17-10 21 8-17 12Z" fill="#8ab556" />
            <path
              d="m20 33 21 8m-14-12 21 8"
              stroke="#e7cd65"
              strokeWidth="4"
            />
            <path d="m21 28 2-7m10 4 2-7m10 4 2-7" stroke="#699448" />
            <path d="m18 23 5-2 3 3m4-4 5-2 3 3m4-3 5-2 3 3" stroke="#9bbb55" />
          </>
        )}
        {(name === "house" || name === "hq") && (
          <>
            <path
              d="M14 29h35v27H14Z"
              fill={name === "hq" ? "#f3e7ce" : "#f0d9b2"}
            />
            <path
              d="m7 30 24-20 26 20-7 6-19-15-18 15Z"
              fill={name === "hq" ? "#7dabc0" : "#d88b6d"}
            />
            <path d="M27 42h10v14H27Z" fill="#aa8058" />
            <path d="M18 36h7v8h-7Zm22 0h6v8h-6Z" fill="#a8ced9" />
            <path d="M25 56h15" stroke="#e9cfa1" strokeWidth="4" />
            {name === "hq" && (
              <>
                <path d="M32 10V2m1 0h12l-3 4 3 4H33" fill="#d98671" />
                <circle cx="32" cy="31" r="4" fill="#f7f1df" />
                <path d="M32 28v4l2 1" strokeWidth="1.4" />
              </>
            )}
          </>
        )}
        {name === "map" && (
          <>
            <path d="m8 15 15-6 18 6 15-6v40l-15 6-18-6-15 6Z" fill="#f5ebd5" />
            <path d="m23 9 0 40m18-34v40" stroke="#bcac8c" />
            <path
              d="m13 34 8-8 10 7 7-10 10 5 4-5"
              stroke="#92b97e"
              strokeWidth="6"
            />
            <circle cx="36" cy="32" r="4" fill="#d59672" />
          </>
        )}
        {name === "calendar" && (
          <>
            <rect x="10" y="13" width="44" height="42" rx="8" fill="#fff8e8" />
            <path d="M10 24h44v-7q0-4-5-4H15q-5 0-5 4Z" fill="#d99280" />
            <path d="M22 8v11m20-11v11" />
            <path
              d="M21 33h4m10 0h4m-18 9h4m10 0h4"
              stroke="#9eaf9d"
              strokeWidth="4"
            />
          </>
        )}
        {name === "coin" && (
          <>
            <ellipse cx="32" cy="34" rx="23" ry="24" fill="#d8a43b" />
            <ellipse cx="30" cy="30" rx="22" ry="23" fill="#f6d36b" />
            <ellipse cx="30" cy="30" rx="15" ry="16" stroke="#d2a13f" />
            <path
              d="M34 20h-8v20h8m-13-10h14"
              stroke="#fff0b2"
              strokeWidth="3"
            />
          </>
        )}
        {name === "people" && (
          <>
            <circle cx="23" cy="21" r="9" fill="#a8cbd9" />
            <circle cx="43" cy="24" r="7" fill="#bed8df" />
            <path d="M8 50v-8q0-11 15-11t15 11v8Z" fill="#9abfd0" />
            <path d="M39 36q15-4 17 8v6H40" fill="#bed8df" />
          </>
        )}
        {name === "jobs" && (
          <>
            <rect x="9" y="23" width="46" height="29" rx="6" fill="#dbc393" />
            <path d="M23 23v-9h18v9m-32 11q23 12 46 0" />
            <rect x="27" y="33" width="10" height="9" rx="2" fill="#fff0cf" />
          </>
        )}
        {name === "menu" && (
          <path d="M16 18h32M16 32h32M16 46h32" strokeWidth="5" />
        )}
        {name === "close" && (
          <path d="m18 18 28 28m0-28L18 46" strokeWidth="4" />
        )}
        {name === "pan" && (
          <>
            <path
              d="M32 7v50M7 32h50m-31-19 6-6 6 6m-12 38 6 6 6-6M13 26l-6 6 6 6m38-12 6 6-6 6"
              strokeWidth="3.5"
            />
            <circle cx="32" cy="32" r="8" fill="#f5dfb4" />
          </>
        )}
        {name === "inspect" && (
          <>
            <circle cx="27" cy="26" r="16" fill="#c8e0dd" />
            <path d="m40 39 14 15" strokeWidth="8" />
            <path d="M20 21q6-6 12-3" stroke="#fff9e9" strokeWidth="4" />
          </>
        )}
        {name === "center" && (
          <>
            <circle cx="32" cy="32" r="17" fill="#ecedcd" />
            <circle cx="32" cy="32" r="6" fill="#87aa88" />
            <path d="M32 7v11m0 28v11M7 32h11m28 0h11" />
          </>
        )}
        {name === "grid" && (
          <>
            <path d="m8 24 23-13 25 13-24 15Z" fill="#e9dfc5" />
            <path d="m8 34 24 15 24-15m-48 10 24 14 24-14M20 18l24 14m-1-14L20 32" />
          </>
        )}
        {name === "save" && (
          <>
            <path d="M13 9h31l8 9v37H13Z" fill="#d7dcc0" />
            <path d="M23 9v16h20V9M22 55V36h22v19" fill="#fff6e1" />
            <path d="M35 14v7" />
          </>
        )}
        {name === "help" && (
          <>
            <circle cx="32" cy="32" r="23" fill="#efdfb7" />
            <path
              d="M23 25q0-10 10-10 10 1 8 10-1 4-9 8v6m0 9v1"
              strokeWidth="4"
            />
          </>
        )}
        {name === "clock" && (
          <>
            <circle cx="32" cy="32" r="23" fill="#f4e9cb" />
            <path d="M32 16v17l12 7" strokeWidth="4" />
          </>
        )}
        {name === "pause" && (
          <>
            <path d="M23 18v28m18-28v28" strokeWidth="8" />
          </>
        )}
        {name === "play" && <path d="m23 14 26 18-26 18Z" fill="#709a67" />}
        {name === "check" && (
          <path d="m14 33 12 12 25-27" stroke="#658850" strokeWidth="6" />
        )}
        {name === "restart" && (
          <>
            <path d="M13 23a22 22 0 1 1-1 20M13 10v15h15" strokeWidth="4" />
          </>
        )}
      </g>
    </svg>
  );
}
