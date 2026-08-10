type PlanPreviewProps = {
  title: string;
  time: string;
  note: string;
};

export default function PlanPreview({ title, time, note }: PlanPreviewProps) {
  return (
    <div className="plan-preview">
      <span>{time}</span>
      <strong>{title}</strong>
      <p>{note}</p>
    </div>
  );
}
