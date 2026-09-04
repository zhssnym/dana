import { describe, expect, test } from 'vitest'

import { linkedParts, linksIn, videoTarget } from './composer-research-content.js'

describe('writing-first link enrichment', () => {
  test('recognises YouTube, Vimeo, and direct video without treating every link as media', () => {
    expect(videoTarget('https://youtu.be/jNQXAC9IVRw')).toEqual({
      kind: 'youtube',
      src: 'https://www.youtube-nocookie.com/embed/jNQXAC9IVRw',
    })
    expect(videoTarget('https://www.youtube.com/shorts/abc123')).toEqual({
      kind: 'youtube',
      src: 'https://www.youtube-nocookie.com/embed/abc123',
    })
    expect(videoTarget('https://vimeo.com/76979871')).toEqual({
      kind: 'vimeo',
      src: 'https://player.vimeo.com/video/76979871',
    })
    expect(videoTarget('https://cdn.example.com/demo.webm')).toEqual({
      kind: 'direct',
      src: 'https://cdn.example.com/demo.webm',
    })
    expect(videoTarget('https://example.com/brief')).toBeNull()
    expect(videoTarget('https://youtu.be/not!valid')).toBeNull()
    expect(videoTarget('https://vimeo.com/not-a-number')).toBeNull()
  })

  test('finds labelled and bare links once, in reading order', () => {
    expect(
      linksIn(
        'Read [the brief](https://example.com/brief), then watch https://youtu.be/jNQXAC9IVRw',
      ),
    ).toEqual([
      'https://example.com/brief',
      'https://youtu.be/jNQXAC9IVRw',
    ])
    expect(
      linksIn('First https://example.com/a then [the second](https://example.com/b)'),
    ).toEqual(['https://example.com/a', 'https://example.com/b'])
  })

  test('refuses unsafe and malformed media addresses', () => {
    expect(videoTarget('javascript:alert(1)')).toBeNull()
    expect(videoTarget('not a URL')).toBeNull()
  })

  test('preserves readable labels while separating safe link targets', () => {
    expect(linkedParts('See [the brief](https://example.com/brief).')).toEqual([
      { kind: 'text', value: 'See ' },
      { kind: 'link', value: 'the brief', href: 'https://example.com/brief' },
      { kind: 'text', value: '.' },
    ])
  })
})
