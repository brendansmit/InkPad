export const feedbackLibrary = {
  strengths: [
    {
      id: 'clear_argument',
      title: 'Clear argument',
      explanation: 'The piece makes a clear central point and returns to it consistently.',
    },
    {
      id: 'strong_evidence',
      title: 'Strong evidence',
      explanation: 'The writing chooses evidence that supports the point instead of simply filling space.',
    },
    {
      id: 'effective_structure',
      title: 'Effective structure',
      explanation: 'The ideas are ordered in a way that helps the reader follow the line of thought.',
    },
  ],
  targets: [
    {
      id: 'develop_explanation',
      title: 'Develop explanation',
      explanation: 'After using evidence, explain how it proves the point and why it matters.',
    },
    {
      id: 'sentence_boundaries',
      title: 'Control sentence boundaries',
      explanation: 'Check where one complete idea ends before starting the next sentence.',
    },
    {
      id: 'paragraph_focus',
      title: 'Improve paragraph focus',
      explanation: 'Keep each paragraph centred on one job so the argument feels deliberate.',
    },
  ],
};

export function feedbackOptionMap(kind) {
  const options = kind === 'strength' ? feedbackLibrary.strengths : feedbackLibrary.targets;
  return new Map(options.map(option => [option.id, option]));
}
