import { Link } from 'react-router-dom'
import { Hourglass } from 'lucide-react'
import { EmptyState, PageHeader } from '../components/ui'

/** Honest placeholder for modules that are designed but not built yet. */
export function ComingSoon({ title, milestone }: { title: string; milestone: string }) {
  return <>
    <PageHeader eyebrow="IN DEVELOPMENT" title={title} />
    <section className="panel">
      <EmptyState icon={Hourglass} title={`${title} is coming in an upcoming milestone`} action={<Link className="secondary-button" to="/pantry">Go to Pantry</Link>}>{milestone}</EmptyState>
    </section>
  </>
}
