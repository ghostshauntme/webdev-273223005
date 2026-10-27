const readline = require('node:readline');
const fs = require('node:fs');
const path = require('node:path');

const lectures = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'lectures.json'), 'utf8')
);

// Our two tools
const tools = [
  {
    name: 'find_lecture',
    description:
      'Return the title and topics of one course lecture by its number, 1 to 12. Use it when asked what a specific lecture covers.',
    inputSchema: {
      type: 'object',
      properties: {
        number: {
          type: 'integer',
          description: 'Lecture number, 1 to 12'
        }
      },
      required: ['number']
    }
  },
  {
    name: 'search_lectures',
    description:
      'Search course lecture titles and topics by keyword. Use this when someone wants to find which lectures discuss a subject.',
    inputSchema: {
      type: 'object',
      properties: {
        keyword: {
          type: 'string',
          description: 'Keyword to search for'
        }
      },
      required: ['keyword']
    }
  }
];

// Send JSON-RPC response
function send(reply) {
  process.stdout.write(JSON.stringify(reply) + '\n');
}

// Create a tool result
function textResult(id, text, isError = false) {
  return {
    jsonrpc: '2.0',
    id: id,
    result: {
      content: [
        {
          type: 'text',
          text: text
        }
      ],
      isError: isError
    }
  };
}

// Create a protocol error
function protocolError(id, code, message) {
  return {
    jsonrpc: '2.0',
    id: id,
    error: {
      code: code,
      message: message
    }
  };
}

// Convert lecture topics to text
function topicsOf(lecture) {
  return Array.isArray(lecture.topics)
    ? lecture.topics.join(', ')
    : String(lecture.topics || '');
}

// Handle incoming messages
function handle(msg) {

  // Initialize handshake
  if (msg.method === 'initialize') {
    return {
      jsonrpc: '2.0',
      id: msg.id,
      result: {
        protocolVersion: msg.params.protocolVersion,
        capabilities: {
          tools: {}
        },
        serverInfo: {
          name: 'lectures',
          version: '0.1.0'
        }
      }
    };
  }

  // Notification: no response
  if (msg.method === 'notifications/initialized') {
    return null;
  }

  // Other notifications also receive no response
  if (msg.id === undefined) {
    return null;
  }

  // List tools
  if (msg.method === 'tools/list') {
    return {
      jsonrpc: '2.0',
      id: msg.id,
      result: {
        tools: tools
      }
    };
  }

  // Call tools
  if (msg.method === 'tools/call') {
    const name = msg.params?.name;
    const args = msg.params?.arguments || {};

    // Tool 1: Find lecture
    if (name === 'find_lecture') {

      if (!Number.isInteger(args.number)) {
        return protocolError(
          msg.id,
          -32602,
          'Lecture number must be an integer'
        );
      }

      const lecture = lectures.find(
        (l) => l.number === args.number
      );

      if (!lecture) {
        return textResult(
          msg.id,
          'There is no lecture ' + args.number +
          '. The course has lectures 1 to 12.',
          true
        );
      }

      return textResult(
        msg.id,
        'Lecture ' + lecture.number + ': ' +
        lecture.title + '. Topics: ' + topicsOf(lecture),
        false
      );
    }

    // Tool 2: Search lectures
    if (name === 'search_lectures') {

      if (
        typeof args.keyword !== 'string' ||
        args.keyword.trim() === ''
      ) {
        return protocolError(
          msg.id,
          -32602,
          'A keyword is required'
        );
      }

      const keyword = args.keyword.toLowerCase();

      const matches = lectures.filter((lecture) => {
        const text =
          lecture.title + ' ' + topicsOf(lecture);

        return text.toLowerCase().includes(keyword);
      });

      if (matches.length === 0) {
        return textResult(
          msg.id,
          'No lectures found for: ' + args.keyword,
          false
        );
      }

      const result = matches.map(
        (lecture) =>
          'Lecture ' + lecture.number + ': ' +
          lecture.title + '. Topics: ' + topicsOf(lecture)
      ).join('\n');

      return textResult(msg.id, result, false);
    }

    // Unknown tool
    return protocolError(
      msg.id,
      -32602,
      'Unknown tool: ' + name
    );
  }

  // Unknown method
  return protocolError(
    msg.id,
    -32601,
    'Unknown method: ' + msg.method
  );
}

// Read stdin line by line
const lines = readline.createInterface({
  input: process.stdin
});

lines.on('line', (line) => {
  console.error('got: ' + line);

  let msg;

  try {
    msg = JSON.parse(line);
  } catch (error) {
    send(protocolError(null, -32700, 'Parse error'));
    return;
  }

  const reply = handle(msg);

  if (reply) {
    send(reply);
  }
});