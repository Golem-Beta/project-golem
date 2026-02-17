"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Copy, Trash2, Plus, RefreshCw } from "lucide-react";

interface MemoryItem {
    text: string;
    metadata?: any;
    score?: number;
}

export function MemoryTable() {
    const [memories, setMemories] = useState<MemoryItem[]>([]);
    const [loading, setLoading] = useState(false);
    const [newMemory, setNewMemory] = useState("");

    const fetchMemories = async () => {
        setLoading(true);
        try {
            const res = await fetch("/api/memory");
            if (res.ok) {
                const data = await res.json();
                // Handle different data structures (array or object)
                const list = Array.isArray(data) ? data : (data.avoidList ? data.avoidList.map((t: string) => ({ text: t, metadata: { type: 'avoid' } })) : []);
                setMemories(list);
            }
        } catch (e) {
            console.error("Failed to fetch memories", e);
        } finally {
            setLoading(false);
        }
    };

    const addMemory = async () => {
        if (!newMemory.trim()) return;
        try {
            await fetch("/api/memory", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ text: newMemory, metadata: { type: "manual", source: "dashboard" } }),
            });
            setNewMemory("");
            fetchMemories();
        } catch (e) {
            console.error("Failed to add memory", e);
        }
    };

    useEffect(() => {
        fetchMemories();
    }, []);

    return (
        <div className="space-y-4">
            <div className="flex space-x-2">
                <input
                    type="text"
                    value={newMemory}
                    onChange={(e) => setNewMemory(e.target.value)}
                    placeholder="New memory content..."
                    className="flex-1 bg-gray-900 border border-gray-800 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
                />
                <Button onClick={addMemory} disabled={!newMemory.trim()}>
                    <Plus className="w-4 h-4 mr-2" />
                    Add
                </Button>
                <Button variant="outline" onClick={fetchMemories} disabled={loading}>
                    <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                </Button>
            </div>

            <div className="border border-gray-800 rounded-md overflow-hidden">
                <table className="w-full text-sm text-left text-gray-400">
                    <thead className="text-xs text-gray-500 uppercase bg-gray-900">
                        <tr>
                            <th scope="col" className="px-6 py-3">Content</th>
                            <th scope="col" className="px-6 py-3 w-32">Type</th>
                            <th scope="col" className="px-6 py-3 w-24">Action</th>
                        </tr>
                    </thead>
                    <tbody>
                        {memories.length === 0 ? (
                            <tr>
                                <td colSpan={3} className="px-6 py-4 text-center italic">No memories found.</td>
                            </tr>
                        ) : (
                            memories.map((mem, index) => (
                                <tr key={index} className="bg-black border-b border-gray-800 hover:bg-gray-900/50">
                                    <td className="px-6 py-4 font-medium text-white break-words max-w-xl">
                                        {mem.text}
                                    </td>
                                    <td className="px-6 py-4">
                                        <span className="px-2 py-1 rounded-full bg-blue-900/30 text-blue-400 text-xs border border-blue-800">
                                            {mem.metadata?.type || 'general'}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 flex space-x-2">
                                        <button className="hover:text-white transition-colors">
                                            <Copy className="w-4 h-4" />
                                        </button>
                                        {/* Delete not yet implemented in backend properly for all drivers */}
                                        {/* <button className="hover:text-red-400 transition-colors">
                        <Trash2 className="w-4 h-4" />
                    </button> */}
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
