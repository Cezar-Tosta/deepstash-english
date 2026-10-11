import { ReviewFlow } from '../../components/ReviewFlow';
import { Hint } from '../../components/ui';
import { type StepProps } from './shared';

// ---------- 1. REVIEW ----------

export function ReviewStep({ bundle }: StepProps) {
  return (
    <div className="space-y-4">
      <Hint>Tente recuperar o significado e criar uma frase antes de conferir.</Hint>
      <ReviewFlow date={bundle.session.date} />
    </div>
  );
}
