import MaterialIcon from "./MaterialIcon";

interface Props {
  value: string;
  onChange: (material: string) => void;
  iconPackDir?: string;
  datalistId: string;
  placeholder?: string;
  style?: React.CSSProperties;
}

export default function MaterialField({ value, onChange, iconPackDir, datalistId, placeholder, style }: Props) {
  return (
    <div className="material-field" style={style}>
      <MaterialIcon material={value} iconPackDir={iconPackDir} />
      <input
        list={datalistId}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value.toUpperCase())}
      />
    </div>
  );
}
